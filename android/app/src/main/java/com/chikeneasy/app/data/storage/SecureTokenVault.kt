package com.chikeneasy.app.data.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureTokenVault(context: Context) : TokenVault {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun getToken(): String = prefs.getString(KEY_TOKEN, "").orEmpty()

    override fun saveToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token.trim()).apply()
    }

    override fun clearToken() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    companion object {
        private const val FILE_NAME = "chiken_easy_secure"
        private const val KEY_TOKEN = "api_token"
    }
}
