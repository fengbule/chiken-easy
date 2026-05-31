package com.chikeneasy.app.data.storage

import org.junit.Assert.assertEquals
import org.junit.Test

class InMemoryTokenVaultTest {
    @Test
    fun savesTrimsAndClearsToken() {
        val vault = InMemoryTokenVault()
        vault.saveToken("  ck_test  ")
        assertEquals("ck_test", vault.getToken())

        vault.clearToken()
        assertEquals("", vault.getToken())
    }
}
