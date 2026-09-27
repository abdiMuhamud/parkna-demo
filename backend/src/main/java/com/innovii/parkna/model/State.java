package com.innovii.parkna.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Everything the engine works on. Maps keep insertion order, which the screens rely on. */
public class State {
    public long ver;
    public Clock clock = new Clock();
    public Map<String, PlateRecord> plates = new LinkedHashMap<>();
    public Map<String, Subscriber> nums = new LinkedHashMap<>();
    /** Newest first; only the newest {@link #LOG_KEEP} are kept in memory (all are in the database). */
    public List<LedgerEntry> log = new ArrayList<>();
    /** Newest first; only the newest {@link #OUT_KEEP} are kept. */
    public List<OutMessage> out = new ArrayList<>();
    public List<Check> checks = new ArrayList<>();
    public Map<String, Officer> off = new LinkedHashMap<>();
    public Map<String, Organisation> orga = new LinkedHashMap<>();
    public List<ParkedCar> park = new ArrayList<>();
    public List<ExceptionCase> exc = new ArrayList<>();
    public Tariff tariff = new Tariff();
    public int seq;

    public static final int LOG_KEEP = 150;
    public static final int LOG_SNAPSHOT = 150;
    public static final int OUT_KEEP = 200;
    public static final int OUT_SNAPSHOT = 80;
    public static final int SMS_KEEP = 300;
}
