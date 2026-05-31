package com.chikeneasy.app.ui.subscriptions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.NodeDto
import com.chikeneasy.app.data.model.RenderSubscriptionRequest
import com.chikeneasy.app.data.model.SubscriptionDto
import com.chikeneasy.app.data.model.SubscriptionUpsertRequest
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SubscriptionsUiState(
    val subscriptions: LoadState<List<SubscriptionDto>> = LoadState.Idle,
    val nodes: List<NodeDto> = emptyList(),
    val selectedId: String = "",
    val name: String = "Android subscription",
    val format: String = "clash",
    val selectedNodeIds: Set<String> = emptySet(),
    val preview: String = "",
    val message: String = "",
    val error: String = ""
)

class SubscriptionsViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow(SubscriptionsUiState())
    val state: StateFlow<SubscriptionsUiState> = _state.asStateFlow()

    init {
        refresh()
        loadNodes()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(subscriptions = LoadState.Loading) }
            _state.update {
                it.copy(subscriptions = when (val result = repository.subscriptions()) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }

    private fun loadNodes() {
        viewModelScope.launch {
            when (val result = repository.nodePool()) {
                is RepositoryResult.Success -> _state.update { it.copy(nodes = result.value) }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message) }
            }
        }
    }

    fun select(subscription: SubscriptionDto) {
        _state.update {
            it.copy(
                selectedId = subscription.id,
                name = subscription.name ?: "",
                format = subscription.format ?: "clash",
                selectedNodeIds = subscription.nodeIds.orEmpty().toSet()
            )
        }
    }

    fun setName(value: String) = _state.update { it.copy(name = value) }
    fun setFormat(value: String) = _state.update { it.copy(format = value) }
    fun toggleNode(id: String) = _state.update {
        val next = it.selectedNodeIds.toMutableSet()
        if (!next.add(id)) next.remove(id)
        it.copy(selectedNodeIds = next)
    }

    fun save() {
        val snapshot = _state.value
        val request = SubscriptionUpsertRequest(
            id = snapshot.selectedId.ifBlank { null },
            name = snapshot.name.ifBlank { "Android subscription" },
            format = snapshot.format,
            nodeIds = snapshot.selectedNodeIds.toList()
        )
        viewModelScope.launch {
            val result = if (snapshot.selectedId.isBlank()) repository.createSubscription(request) else repository.updateSubscription(snapshot.selectedId, request)
            when (result) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Subscription saved", selectedId = result.value.id, error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun preview() {
        val snapshot = _state.value
        val request = RenderSubscriptionRequest(
            id = snapshot.selectedId.ifBlank { null },
            name = snapshot.name.ifBlank { "Android subscription" },
            format = snapshot.format,
            nodeIds = snapshot.selectedNodeIds.toList()
        )
        viewModelScope.launch {
            when (val result = repository.renderSubscription(request)) {
                is RepositoryResult.Success -> _state.update {
                    it.copy(preview = result.value.body ?: result.value.content ?: "", message = "Preview rendered", error = "")
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    fun deleteSelected() {
        val id = _state.value.selectedId
        if (id.isBlank()) return
        viewModelScope.launch {
            when (val result = repository.deleteSubscription(id)) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Subscription deleted", selectedId = "", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }
}
