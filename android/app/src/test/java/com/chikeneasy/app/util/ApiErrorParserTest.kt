package com.chikeneasy.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class ApiErrorParserTest {
    @Test
    fun prefersMessageField() {
        assertEquals("bad request", ApiErrorParser.parse("""{"message":"bad request","error":"fallback"}"""))
    }

    @Test
    fun readsErrorField() {
        assertEquals("invalid API token", ApiErrorParser.parse("""{"error":"invalid API token"}"""))
    }

    @Test
    fun fallsBackToRawText() {
        assertEquals("service unavailable", ApiErrorParser.parse("service unavailable"))
    }
}
