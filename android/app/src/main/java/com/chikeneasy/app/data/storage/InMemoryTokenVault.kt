package com.chikeneasy.app.data.storage

class InMemoryTokenVault(initial: String = "") : TokenVault {
    private var token: String = initial

    override fun getToken(): String = token

    override fun saveToken(token: String) {
        this.token = token.trim()
    }

    override fun clearToken() {
        token = ""
    }
}
