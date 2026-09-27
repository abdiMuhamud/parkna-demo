package com.innovii.parkna.sms;

import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.model.OutMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * sms.gateway=kannel: sends each message through Kannel's smsbox HTTP interface (cgi-bin/sendsms), as in the
 * SI/QA manual section 2.1.4. One background thread sends in order; failures are logged, never retried here
 * (Kannel queues once it has accepted a message).
 */
public class KannelSmsGateway implements SmsGateway {
    private static final Logger log = LoggerFactory.getLogger(KannelSmsGateway.class);

    /** GSM 03.38 basic character set: text made only of these goes as normal 160-character SMS. */
    private static final String GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    private final AppConfig.Sms cfg;
    private final HttpClient http;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "parkna-sms"); t.setDaemon(true); return t; });

    public KannelSmsGateway(AppConfig.Sms cfg) {
        this.cfg = cfg;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(cfg.timeoutMs())).build();
        log.info("SMS gateway: Kannel at {} as user '{}', sender {}", cfg.sendSmsUrl(), cfg.username(), cfg.from());
    }

    @Override public void send(OutMessage m) { worker.execute(() -> deliver(m)); }

    /** International number with a leading +, e.g. +2207012345 for 7012345. */
    String msisdn(String num) { return num.startsWith("+") ? num : "+" + cfg.countryCode() + num; }

    static boolean isGsm(String s) { for (char c : s.toCharArray()) if (GSM.indexOf(c) < 0) return false; return true; }

    String url(OutMessage m) {
        boolean unicode = switch (cfg.coding()) { case "0", "gsm" -> false; case "2", "ucs2" -> true; default -> !isGsm(m.text); };
        StringBuilder u = new StringBuilder(cfg.sendSmsUrl())
                .append(cfg.sendSmsUrl().contains("?") ? '&' : '?')
                .append("username=").append(enc(cfg.username()))
                .append("&password=").append(enc(cfg.password()))
                .append("&from=").append(enc(cfg.from()))
                .append("&to=").append(enc(msisdn(m.num)))
                .append("&text=").append(enc(m.text));
        if (unicode) u.append("&coding=2&charset=UTF-8");
        return u.toString();
    }

    private void deliver(OutMessage m) {
        String to = msisdn(m.num);
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url(m))).timeout(Duration.ofMillis(cfg.timeoutMs())).GET().build();
            HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 202 || r.statusCode() == 200)
                log.info("SMS to {} accepted by Kannel (HTTP {}: {}) [{}]", to, r.statusCode(), r.body().trim(), m.tag == null ? "reply" : m.tag);
            else
                log.warn("SMS to {} rejected by Kannel: HTTP {} {}", to, r.statusCode(), r.body().trim());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("SMS to {} not sent: cannot reach Kannel at {} ({})", to, cfg.sendSmsUrl(), e.toString());
        }
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }

    @Override public void close() {
        worker.shutdown();
        try { worker.awaitTermination(5, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
