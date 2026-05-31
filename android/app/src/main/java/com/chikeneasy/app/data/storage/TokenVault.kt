package com.chikeneasy.app.data.storage

interface TokenVault {
    fun getToken(): String
    fun saveToken(token: String)
    fun clearToken()
}
