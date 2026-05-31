package com.chikeneasy.app.ui.sftp

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.model.SftpListDto
import com.chikeneasy.app.data.repository.PanelRepository
import com.chikeneasy.app.data.repository.RepositoryResult
import com.chikeneasy.app.ui.components.LoadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SftpUiState(
    val agents: List<AgentDto> = emptyList(),
    val selectedAgentId: String = "",
    val path: String = "/root",
    val listing: LoadState<SftpListDto> = LoadState.Idle,
    val message: String = "",
    val error: String = "",
    val newDirectory: String = "",
    val renameFrom: String = "",
    val renameTo: String = "",
    val downloadPath: String = "",
    val uploadName: String = "android-probe.txt",
    val uploadContent: String = "created from Android client\n"
)

class SftpViewModel(
    private val repository: PanelRepository
) : ViewModel() {
    private val _state = MutableStateFlow(SftpUiState())
    val state: StateFlow<SftpUiState> = _state.asStateFlow()

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
            refresh()
        }
    }

    fun selectAgent(id: String) {
        _state.update { it.copy(selectedAgentId = id) }
        refresh()
    }

    fun setPath(path: String) {
        _state.update { it.copy(path = path) }
    }

    fun open(path: String) {
        _state.update { it.copy(path = path) }
        refresh()
    }

    fun up() {
        val path = _state.value.path.trimEnd('/')
        val next = path.substringBeforeLast("/", missingDelimiterValue = "").ifBlank { "/" }
        _state.update { it.copy(path = next) }
        refresh()
    }

    fun refresh() {
        val snapshot = _state.value
        if (snapshot.selectedAgentId.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(listing = LoadState.Loading, error = "", message = "") }
            _state.update {
                it.copy(listing = when (val result = repository.sftpList(snapshot.selectedAgentId, snapshot.path)) {
                    is RepositoryResult.Success -> LoadState.Data(result.value)
                    is RepositoryResult.Failure -> LoadState.Error(result.message)
                })
            }
        }
    }

    fun updateNewDirectory(value: String) = _state.update { it.copy(newDirectory = value) }
    fun updateRenameFrom(value: String) = _state.update { it.copy(renameFrom = value) }
    fun updateRenameTo(value: String) = _state.update { it.copy(renameTo = value) }
    fun updateDownloadPath(value: String) = _state.update { it.copy(downloadPath = value) }
    fun updateUploadName(value: String) = _state.update { it.copy(uploadName = value) }
    fun updateUploadContent(value: String) = _state.update { it.copy(uploadContent = value) }

    fun mkdir() {
        val snapshot = _state.value
        val path = join(snapshot.path, snapshot.newDirectory)
        runAction { repository.sftpMkdir(snapshot.selectedAgentId, path) }
    }

    fun rename() {
        val snapshot = _state.value
        runAction { repository.sftpRename(snapshot.selectedAgentId, snapshot.renameFrom, snapshot.renameTo) }
    }

    fun delete(path: String) {
        val snapshot = _state.value
        runAction { repository.sftpDelete(snapshot.selectedAgentId, path) }
    }

    fun uploadProbe() {
        val snapshot = _state.value
        runAction {
            repository.sftpUpload(
                snapshot.selectedAgentId,
                snapshot.path,
                snapshot.uploadName.ifBlank { "android-probe.txt" },
                snapshot.uploadContent.toByteArray()
            )
        }
    }

    fun downloadText() {
        val snapshot = _state.value
        viewModelScope.launch {
            when (val result = repository.sftpDownloadText(snapshot.selectedAgentId, snapshot.downloadPath)) {
                is RepositoryResult.Success -> _state.update { it.copy(message = result.value.take(1000), error = "") }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    private fun runAction(block: suspend () -> RepositoryResult<*>) {
        viewModelScope.launch {
            when (val result = block()) {
                is RepositoryResult.Success -> {
                    _state.update { it.copy(message = "Operation completed", error = "") }
                    refresh()
                }
                is RepositoryResult.Failure -> _state.update { it.copy(error = result.message, message = "") }
            }
        }
    }

    private fun join(base: String, child: String): String {
        val cleanChild = child.trim().trim('/')
        if (cleanChild.isBlank()) return base
        return "${base.trimEnd('/')}/$cleanChild"
    }
}
