package com.chikeneasy.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.SettingsDto
import com.chikeneasy.app.data.repository.AuthRepository
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.data.storage.PanelConfig
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val config: PanelConfig = PanelConfig(),
    val baseUrlInput: String = "",
    val tokenInput: String = "",
    val settings: LoadState<SettingsDto> = LoadState.Idle,
    val connectionOk: Boolean = false,
    val message: String = "",
    val error: String = "",
    val loggedOut: Boolean = false
)

class SettingsViewModel(
    private val authRepository: AuthRepository,
    private val panelRepository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.config.collect { config ->
                _state.update { it.copy(config = config, baseUrlInput = it.baseUrlInput.ifBlank { config.baseUrl }) }
            }
        }
        refreshSettings()
    }

    fun setBaseUrl(value: String) = _state.update { it.copy(baseUrlInput = value) }
    fun setToken(value: String) = _state.update { it.copy(tokenInput = value) }

    fun refreshSettings() {
        viewModelScope.launch {
            _state.update { it.copy(settings = LoadState.Loading) }
            _state.update {
                it.copy(settings = when (val result = panelRepository.settings()) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }

    fun reverify() {
        viewModelScope.launch {
            when (val result = authRepository.verifySavedSession()) {
                is RepositoryResult.Success -> _state.update { it.copy(connectionOk = true, message = "Session verified", error = "") }
                is RepositoryResult.Failure -> _state.update { it.copy(connectionOk = false, error = result.message, message = "") }
            }
        }
    }

    fun saveConnection() {
        val snapshot = _state.value
        if (snapshot.tokenInput.isBlank()) {
            _state.update { it.copy(error = "Enter the API token to update the saved connection", message = "") }
            return
        }
        viewModelScope.launch {
            val result = authRepository.login(snapshot.baseUrlInput, snapshot.tokenInput)
            when (result) {
                is RepositoryResult.Success -> _state.update { it.copy(message = "Connection updated", error = "", tokenInput = "") }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _state.update { it.copy(loggedOut = true) }
        }
    }
}
