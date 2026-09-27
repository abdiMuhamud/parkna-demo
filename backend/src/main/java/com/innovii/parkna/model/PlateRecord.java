package com.innovii.parkna.model;

import java.util.ArrayList;
import java.util.List;

/** What is known about one number plate: its passes and the numbers that paid for it ("PLATES"). */
public class PlateRecord {
    public String plate;
    public DailyPass daily;
    public MonthlyPass monthly;
    public List<String> payers = new ArrayList<>();
}
