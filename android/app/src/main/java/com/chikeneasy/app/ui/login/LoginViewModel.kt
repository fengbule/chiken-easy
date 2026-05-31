package com.chikeneasy.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.repository.AuthRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val baseUrl: String = "",
    val token: String = "",
    val checking: Boolean = true,
    val submitting: Boolean = false,
    val authenticated: Boolean = false,
    val error: String = ""
)

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.config.collect { config ->
                _state.update { it.copy(baseUrl = config.baseUrl.takeIf { value -> value.isNotBlank() } ?: it.baseUrl) }
            }
        }
        verifySaved()
    }

    fun updateBaseUrl(value: String) {
        _state.update { it.copy(baseUrl = value, error = "") }
    }

    fun updateToken(value: String) {
        _state.update { it.copy(token = value, error = "") }
    }

    fun verifySaved() {
        viewModelScope.launch {
            _state.update { it.copy(checking = true, error = "") }
            when (val result = authRepository.verifySavedSession()) {
                is RepositoryResult.Success -> _state.update { it.copy(checking = false, authenticated = true, error = "") }
                is RepositoryResult.Failure -> _state.update { it.copy(checking = false, authenticated = false, error = "") }
            }
        }
    }

    fun login() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(submitting = true, error = "") }
            when (val result = authRepository.login(snapshot.baseUrl, snapshot.token)) {
                is RepositoryResult.Success -> _state.update {
                    it.copy(submitting = false, authenticated = true, token = "", error = "")
                }
                is RepositoryResult.Failure -> _state.update {
                    it.copy(submitting = false, authenticated = false, error = result.message)
                }
            }
        }
    }

    fun clearSaved() {
        viewModelScope.launch {
            authRepository.logout()
            _state.update { LoginUiState(checking = false) }
        }
    }

    fun markLoggedOut() {
        _state.update { it.copy(authenticated = false, checking = false, token = "") }
    }
}
