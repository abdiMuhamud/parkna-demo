package com.innovii.parkna.sms;

import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.model.OutMessage;

/**
 * Where ParkNa's outgoing SMS go (config.properties: sms.gateway). Messages always appear in the apps' SMS
 * threads; a gateway also delivers them to real phones. Called after the change is saved; must not block.
 */
public interface SmsGateway extends AutoCloseable {
    void send(OutMessage m);

    @Override default void close() {}

    static SmsGateway from(AppConfig.Sms cfg) {
        return switch (cfg.mode()) {
            case SIMULATED -> new SimulatedSmsGateway();
            case KANNEL -> new KannelSmsGateway(cfg);
        };
    }
}
