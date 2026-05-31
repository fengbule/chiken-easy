package com.chikeneasy.app.data.storage

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "chiken_easy_settings")

class AppPreferences(
    private val context: Context,
    private val tokenVault: TokenVault
) {
    val config: Flow<PanelConfig> = context.settingsDataStore.data.map { prefs ->
        PanelConfig(
            baseUrl = prefs[KEY_BASE_URL].orEmpty(),
            hasToken = prefs[KEY_HAS_TOKEN] == true && tokenVault.getToken().isNotBlank()
        )
    }

    suspend fun currentConfig(): PanelConfig = config.first()

    suspend fun saveConnection(baseUrl: String, token: String) {
        tokenVault.saveToken(token)
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_BASE_URL] = baseUrl
            prefs[KEY_HAS_TOKEN] = token.isNotBlank()
        }
    }

    suspend fun saveBaseUrl(baseUrl: String) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_BASE_URL] = baseUrl
        }
    }

    fun token(): String = tokenVault.getToken()

    suspend fun clear() {
        tokenVault.clearToken()
        context.settingsDataStore.edit { it.clear() }
    }

    companion object {
        private val KEY_BASE_URL = stringPreferencesKey("base_url")
        private val KEY_HAS_TOKEN = booleanPreferencesKey("has_token")
    }
}
