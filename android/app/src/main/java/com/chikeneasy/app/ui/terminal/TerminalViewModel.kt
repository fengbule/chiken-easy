package com.chikeneasy.app.ui.terminal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.data.websocket.TerminalClient
import com.chikeneasy.app.data.websocket.TerminalEvent
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TerminalUiState(
    val agents: List<AgentDto> = emptyList(),
    val selectedAgentId: String = "",
    val mode: String = "ssh",
    val connected: Boolean = false,
    val connecting: Boolean = false,
    val output: String = "",
    val input: String = "",
    val error: String = ""
)

class TerminalViewModel(
    private val repository: PanelRepository,
    private val terminalClient: TerminalClient
) : ViewModel() {
    private val _state = MutableStateFlow(TerminalUiState())
    val state: StateFlow<TerminalUiState> = _state.asStateFlow()
    private var terminalJob: Job? = null

    init {
        loadAgents()
    }

    fun loadAgents() {
        viewModelScope.launch {
            when (val result = repository.agents()) {
                is RepositoryResult.Success -> _state.update { current ->
                    val selected = current.selectedAgentId.ifBlank { result.value.firstOrNull()?.id.orEmpty() }
                    current.copy(agents = result.value, selectedAgentId = selected, error = "")
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message) }
            }
        }
    }

    fun selectAgent(id: String) {
        _state.update { it.copy(selectedAgentId = id) }
    }

    fun setMode(value: String) {
        _state.update { it.copy(mode = value) }
    }

    fun updateInput(value: String) {
        _state.update { it.copy(input = value) }
    }

    fun connect() {
        val snapshot = _state.value
        if (snapshot.selectedAgentId.isBlank()) {
            _state.update { it.copy(error = "Select an agent first") }
            return
        }
        terminalJob?.cancel()
        terminalJob = viewModelScope.launch {
            _state.update { it.copy(connecting = true, error = "", output = it.output + "\n[connecting]\n") }
            terminalClient.connect(snapshot.selectedAgentId, snapshot.mode).collect { event ->
                when (event) {
                    TerminalEvent.Closed -> _state.update { it.copy(connected = false, connecting = false, output = it.output + "\n[closed]\n") }
                    is TerminalEvent.Failure -> _state.update { it.copy(connected = false, connecting = false, error = event.message, output = it.output + "\n[error] ${event.message}\n") }
                    is TerminalEvent.Output -> _state.update { it.copy(connected = true, connecting = false, output = it.output + event.text) }
                    is TerminalEvent.Status -> _state.update { it.copy(connected = true, connecting = false, output = it.output + "\n[${event.text}]\n") }
                }
            }
        }
    }

    fun disconnect() {
        terminalJob?.cancel()
        terminalClient.close()
        _state.update { it.copy(connected = false, connecting = false) }
    }

    fun send() {
        val input = _state.value.input
        if (input.isBlank()) return
        terminalClient.sendInput(input + if (input.endsWith("\n")) "" else "\n")
        _state.update { it.copy(input = "") }
    }

    fun clear() {
        _state.update { it.copy(output = "") }
    }

    override fun onCleared() {
        terminalJob?.cancel()
        terminalClient.close()
        super.onCleared()
    }
}
