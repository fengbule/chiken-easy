package com.chikeneasy.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.DashboardDto
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DashboardViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<DashboardDto>>(LoadState.Idle)
    val state: StateFlow<LoadState<DashboardDto>> = _state.asStateFlow()
    private var refreshJob: Job? = null

    init {
        startAutoRefresh()
    }

    fun refresh(showLoading: Boolean = true) {
        viewModelScope.launch {
            if (showLoading) _state.value = LoadState.Loading
            _state.value = when (val result = repository.dashboard()) {
                is RepositoryResult.Success -> LoadState.Data(result.value)
                is RepositoryResult.Failure -> LoadState.Error(result.message)
            }
        }
    }

    private fun startAutoRefresh() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            refresh()
            while (true) {
                delay(5000)
                refresh(showLoading = false)
            }
        }
    }
}
