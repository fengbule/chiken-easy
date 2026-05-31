package com.chikeneasy.app

import android.app.Application
import com.chikeneasy.app.data.api.ApiClientFactory
import com.chikeneasy.app.data.repository.AuthRepository
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.storage.AppPreferences
import com.chikeneasy.app.data.storage.SecureTokenVault
import com.chikeneasy.app.data.websocket.TerminalClient

class ChikenEasyApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(application: Application) {
    private val tokenVault = SecureTokenVault(application)
    val preferences = AppPreferences(application, tokenVault)
    private val apiFactory = ApiClientFactory()

    val authRepository = AuthRepository(preferences, apiFactory)
    val panelRepository = PanelRepository(preferences, apiFactory)
    val terminalClient = TerminalClient(preferences, apiFactory.okHttp { preferences.token() })
}
