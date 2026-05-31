package com.chikeneasy.app.ui.sftp

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.SftpListDto
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.StateScaffold
import com.chikeneasy.app.ui.components.formatBytes
import com.chikeneasy.app.ui.terminal.AgentDropdown

@Composable
fun SftpScreen(viewModel: SftpViewModel) {
    val state by viewModel.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("SFTP", style = MaterialTheme.typography.headlineSmall)
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.message.isNotBlank()) Text(state.message)
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AgentDropdown(state.agents.map { it.id to (it.name ?: it.id) }, state.selectedAgentId, viewModel::selectAgent)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(state.path, viewModel::setPath, label = { Text("Path") }, modifier = Modifier.weight(1f))
                    Button(onClick = viewModel::refresh) { Text("List") }
                    OutlinedButton(onClick = viewModel::up) { Text("Up") }
                }
            }
        }
        val listing = (state.listing as? LoadState.Data<SftpListDto>)?.value
        Column(Modifier.weight(1f)) {
            StateScaffold(state.listing, viewModel::refresh, empty = listing?.entries.orEmpty().isEmpty() && state.listing is LoadState.Data, emptyText = "Directory is empty") {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listing?.entries.orEmpty().forEach { entry ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            if (entry.isDirectory == true) viewModel.open("${state.path.trimEnd('/')}/${entry.name}")
                        }.padding(8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(if (entry.isDirectory == true) Icons.Outlined.Folder else Icons.Outlined.InsertDriveFile, contentDescription = null)
                            Text(entry.name)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(formatBytes(entry.size))
                            OutlinedButton(onClick = { viewModel.delete("${state.path.trimEnd('/')}/${entry.name}") }) { Text("Delete") }
                        }
                    }
                }
                }
            }
        }
        SftpActions(state, viewModel)
    }
}

@Composable
private fun SftpActions(state: SftpUiState, viewModel: SftpViewModel) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.newDirectory, viewModel::updateNewDirectory, label = { Text("New directory") }, modifier = Modifier.weight(1f))
                Button(onClick = viewModel::mkdir) { Text("Mkdir") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.renameFrom, viewModel::updateRenameFrom, label = { Text("Old path") }, modifier = Modifier.weight(1f))
                OutlinedTextField(state.renameTo, viewModel::updateRenameTo, label = { Text("New path") }, modifier = Modifier.weight(1f))
                Button(onClick = viewModel::rename) { Text("Rename") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.uploadName, viewModel::updateUploadName, label = { Text("Upload name") }, modifier = Modifier.weight(1f))
                Button(onClick = viewModel::uploadProbe) { Text("Upload") }
            }
            OutlinedTextField(
                state.uploadContent,
                viewModel::updateUploadContent,
                label = { Text("Upload text") },
                minLines = 2,
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.downloadPath, viewModel::updateDownloadPath, label = { Text("Download path") }, modifier = Modifier.weight(1f))
                Button(onClick = viewModel::downloadText) { Text("Download") }
            }
        }
    }
}
