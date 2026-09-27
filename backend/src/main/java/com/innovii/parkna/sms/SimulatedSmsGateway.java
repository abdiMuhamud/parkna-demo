package com.innovii.parkna.sms;

import com.innovii.parkna.model.OutMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** sms.gateway=simulated: nothing leaves the server; messages are only shown in the apps and portals. */
public class SimulatedSmsGateway implements SmsGateway {
    private static final Logger log = LoggerFactory.getLogger(SimulatedSmsGateway.class);

    @Override public void send(OutMessage m) {
        log.debug("SMS (simulated) to {} [{}]: {}", m.num, m.tag, m.text);
    }
}
