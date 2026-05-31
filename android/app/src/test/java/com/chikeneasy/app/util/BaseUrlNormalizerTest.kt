package com.chikeneasy.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BaseUrlNormalizerTest {
    @Test
    fun addsHttpSchemeAndTrailingSlash() {
        assertEquals("http://192.168.1.10:7788/", BaseUrlNormalizer.normalize("192.168.1.10:7788"))
    }

    @Test
    fun preservesHttpsAndNormalizesWebSocketScheme() {
        assertEquals("https://panel.example.com/", BaseUrlNormalizer.normalize("https://panel.example.com/"))
        assertEquals("wss://panel.example.com", BaseUrlNormalizer.websocketBase("https://panel.example.com/"))
    }

    @Test
    fun rejectsUnsupportedScheme() {
        assertThrows(IllegalArgumentException::class.java) {
            BaseUrlNormalizer.normalize("ftp://panel.example.com")
        }
    }
}
