package com.chikeneasy.app.ui.nodepool

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.model.NodeDto
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NodePoolUiState(
    val nodes: LoadState<List<NodeDto>> = LoadState.Idle,
    val agents: List<AgentDto> = emptyList(),
    val query: String = "",
    val selectedNodeId: String = "",
    val selectedAgentId: String = "",
    val importText: String = "",
    val exportText: String = "",
    val message: String = "",
    val error: String = ""
)

class NodePoolViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow(NodePoolUiState())
    val state: StateFlow<NodePoolUiState> = _state.asStateFlow()

    init {
        refresh()
        loadAgents()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(nodes = LoadState.Loading) }
            _state.update {
                it.copy(nodes = when (val result = repository.nodePool()) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }

    fun loadAgents() {
        viewModelScope.launch {
            when (val result = repository.agents()) {
                is RepositoryResult.Success -> _state.update { current ->
                    current.copy(agents = result.value, selectedAgentId = current.selectedAgentId.ifBlank { result.value.firstOrNull()?.id.orEmpty() })
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message) }
            }
        }
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }
    fun setImportText(value: String) = _state.update { it.copy(importText = value) }
    fun selectNode(id: String) = _state.update { it.copy(selectedNodeId = id) }
    fun selectAgent(id: String) = _state.update { it.copy(selectedAgentId = id) }

    fun importText() {
        val text = _state.value.importText
        viewModelScope.launch {
            when (val result = repository.nodeImport(text)) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Imported nodes. Warnings: ${result.value.warnings?.size ?: 0}", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun importFromAgent() {
        val agentId = _state.value.selectedAgentId
        if (agentId.isBlank()) return
        viewModelScope.launch {
            when (val result = repository.nodeFromAgent(agentId)) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Imported from agent", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun checkSelected() {
        val nodeId = _state.value.selectedNodeId
        viewModelScope.launch {
            when (val result = repository.nodeCheck(if (nodeId.isBlank()) emptyList() else listOf(nodeId))) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Check completed: ${result.value.results?.size ?: 0}", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun export(format: String = "clash") {
        viewModelScope.launch {
            when (val result = repository.nodeExport(format)) {
                is RepositoryResult.Success -> _state.update { it.copy(exportText = result.value, message = "Export ready", error = "") }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun deleteSelected() {
        val id = _state.value.selectedNodeId
        if (id.isBlank()) return
        viewModelScope.launch {
            when (val result = repository.nodeDelete(id)) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Deleted node", selectedNodeId = "", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }
}
