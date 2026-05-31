package com.chikeneasy.app.ui.serverdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.model.ConfigVersionDto
import com.chikeneasy.app.data.model.OkResponse
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ServerDetailUiState(
    val detail: LoadState<AgentDto> = LoadState.Idle,
    val config: LoadState<OkResponse> = LoadState.Idle,
    val versions: LoadState<List<ConfigVersionDto>> = LoadState.Idle,
    val actionMessage: String = "",
    val actionError: String = ""
)

class ServerDetailViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow(ServerDetailUiState())
    val state: StateFlow<ServerDetailUiState> = _state.asStateFlow()
    private var agentId: String = ""

    fun load(id: String) {
        if (id == agentId && _state.value.detail is LoadState.Data) return
        agentId = id
        refresh()
    }

    fun refresh() {
        val id = agentId
        if (id.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(detail = LoadState.Loading) }
            _state.update {
                it.copy(detail = when (val result = repository.agent(id)) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
        loadConfig()
        loadVersions()
    }

    fun service(action: String) {
        val id = agentId
        viewModelScope.launch {
            _state.update { it.copy(actionMessage = "", actionError = "") }
            when (val result = repository.serviceAction(id, action)) {
                is RepositoryResult.Success -> _state.update {
                    it.copy(actionMessage = "Service $action requested. Command: ${result.value.commandId ?: "-"}")
                }
                is RepositoryResult.Failure -> _state.update { it.copy(actionError = result.message) }
            }
        }
    }

    fun loadConfig() {
        val id = agentId
        if (id.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(config = LoadState.Loading) }
            _state.update {
                it.copy(config = when (val result = repository.config(id)) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }

    fun loadVersions() {
        val id = agentId
        if (id.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(versions = LoadState.Loading) }
            _state.update {
                it.copy(versions = when (val result = repository.configVersions(id)) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }
}
