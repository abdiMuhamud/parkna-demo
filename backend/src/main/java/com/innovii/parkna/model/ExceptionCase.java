package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A payment exception recorded in the back office, e.g. a wrong-plate payment ("EXC"). */
public class ExceptionCase {
    public String type;
    @JsonInclude(JsonInclude.Include.NON_NULL) public String plate;
    public String detail;
    public String status;
}
