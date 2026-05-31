package com.chikeneasy.app.ui.servers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ServersViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<AgentDto>>>(LoadState.Idle)
    val state: StateFlow<LoadState<List<AgentDto>>> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            _state.value = when (val result = repository.agents()) {
                is RepositoryResult.Success -> LoadState.Data(result.value)
                is RepositoryResult.Failure -> LoadState.Error(result.message)
            }
        }
    }
}
