package com.chikeneasy.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.chikeneasy.app.AppContainer
import com.chikeneasy.app.ui.dashboard.DashboardViewModel
import com.chikeneasy.app.ui.login.LoginViewModel
import com.chikeneasy.app.ui.nodepool.NodePoolViewModel
import com.chikeneasy.app.ui.serverdetail.ServerDetailViewModel
import com.chikeneasy.app.ui.servers.ServersViewModel
import com.chikeneasy.app.ui.settings.SettingsViewModel
import com.chikeneasy.app.ui.sftp.SftpViewModel
import com.chikeneasy.app.ui.subscriptions.SubscriptionsViewModel
import com.chikeneasy.app.ui.terminal.TerminalViewModel

class AppViewModelFactory(
    private val container: AppContainer
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(LoginViewModel::class.java) -> LoginViewModel(container.authRepository) as T
            modelClass.isAssignableFrom(DashboardViewModel::class.java) -> DashboardViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(ServersViewModel::class.java) -> ServersViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(ServerDetailViewModel::class.java) -> ServerDetailViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(TerminalViewModel::class.java) -> TerminalViewModel(container.panelRepository, container.terminalClient) as T
            modelClass.isAssignableFrom(SftpViewModel::class.java) -> SftpViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(NodePoolViewModel::class.java) -> NodePoolViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(SubscriptionsViewModel::class.java) -> SubscriptionsViewModel(container.panelRepository) as T
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(container.authRepository, container.panelRepository) as T
            else -> throw IllegalArgumentException("Unknown ViewModel ${modelClass.name}")
        }
    }
}
