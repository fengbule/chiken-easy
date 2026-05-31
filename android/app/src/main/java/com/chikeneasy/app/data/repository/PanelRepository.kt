package com.chikeneasy.app.data.repository

import com.chikeneasy.app.data.api.ApiClientFactory
import com.chikeneasy.app.data.model.DashboardDto
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.model.ConfigVersionDto
import com.chikeneasy.app.data.model.NodeCheckRequest
import com.chikeneasy.app.data.model.NodeCheckResponse
import com.chikeneasy.app.data.model.NodeDto
import com.chikeneasy.app.data.model.NodeImportRequest
import com.chikeneasy.app.data.model.NodeImportResponse
import com.chikeneasy.app.data.model.OkResponse
import com.chikeneasy.app.data.model.PathRequest
import com.chikeneasy.app.data.model.RenderSubscriptionRequest
import com.chikeneasy.app.data.model.RenderSubscriptionResponse
import com.chikeneasy.app.data.model.RenameRequest
import com.chikeneasy.app.data.model.SettingsDto
import com.chikeneasy.app.data.model.SftpListDto
import com.chikeneasy.app.data.model.SubscriptionDto
import com.chikeneasy.app.data.model.SubscriptionMetaDto
import com.chikeneasy.app.data.model.SubscriptionUpsertRequest
import com.chikeneasy.app.data.storage.AppPreferences
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class PanelRepository(
    preferences: AppPreferences,
    apiClientFactory: ApiClientFactory
) : BaseRepository(preferences, apiClientFactory) {
    suspend fun dashboard(): RepositoryResult<DashboardDto> = safeCall { dashboard() }
    suspend fun agents(): RepositoryResult<List<AgentDto>> = safeCall { agents() }
    suspend fun agent(id: String): RepositoryResult<AgentDto> = safeCall { agent(id) }
    suspend fun serviceAction(id: String, action: String): RepositoryResult<OkResponse> = safeCall { serviceAction(id, action) }
    suspend fun config(id: String): RepositoryResult<OkResponse> = safeCall { agentConfig(id) }
    suspend fun configVersions(id: String): RepositoryResult<List<ConfigVersionDto>> = safeCall { configVersions(id) }

    suspend fun sftpList(id: String, path: String): RepositoryResult<SftpListDto> = safeCall { sftpList(id, path) }
    suspend fun sftpUpload(id: String, directory: String, fileName: String, bytes: ByteArray): RepositoryResult<OkResponse> {
        val body = bytes.toRequestBody("application/octet-stream".toMediaType())
        val part = MultipartBody.Part.createFormData("file", fileName, body)
        val directoryBody = directory.toRequestBody("text/plain".toMediaType())
        return safeCall { sftpUpload(id, part, directoryBody) }
    }
    suspend fun sftpDelete(id: String, path: String): RepositoryResult<OkResponse> = safeCall { sftpDelete(id, path) }
    suspend fun sftpMkdir(id: String, path: String): RepositoryResult<OkResponse> = safeCall { sftpMkdir(id, PathRequest(path)) }
    suspend fun sftpRename(id: String, oldPath: String, newPath: String): RepositoryResult<OkResponse> = safeCall { sftpRename(id, RenameRequest(oldPath, newPath)) }
    suspend fun sftpDownloadText(id: String, path: String): RepositoryResult<String> = safeCall { sftpDownload(id, path).string() }

    suspend fun nodePool(): RepositoryResult<List<NodeDto>> = safeCall { nodePool() }
    suspend fun nodeDetail(id: String): RepositoryResult<NodeDto> = safeCall { nodeDetail(id) }
    suspend fun nodeImport(content: String): RepositoryResult<NodeImportResponse> = safeCall { nodeImport(NodeImportRequest(content = content)) }
    suspend fun nodeFromAgent(agentId: String): RepositoryResult<OkResponse> = safeCall { nodeFromAgent(agentId) }
    suspend fun nodeUpdate(id: String, patch: Map<String, Any?>): RepositoryResult<NodeDto> = safeCall { nodeUpdate(id, patch) }
    suspend fun nodeDelete(id: String): RepositoryResult<OkResponse> = safeCall { nodeDelete(id) }
    suspend fun nodeCheck(ids: List<String>, agentId: String = ""): RepositoryResult<NodeCheckResponse> =
        safeCall { nodeCheck(NodeCheckRequest(nodeIds = ids, checkedBy = if (agentId.isBlank()) "server" else agentId, agentId = agentId)) }
    suspend fun nodeExport(format: String): RepositoryResult<String> = safeCall { nodeExport(format).string() }

    suspend fun subscriptionMeta(): RepositoryResult<SubscriptionMetaDto> = safeCall { subscriptionMeta() }
    suspend fun subscriptions(): RepositoryResult<List<SubscriptionDto>> = safeCall { subscriptions() }
    suspend fun subscription(id: String): RepositoryResult<SubscriptionDto> = safeCall { subscription(id) }
    suspend fun createSubscription(request: SubscriptionUpsertRequest): RepositoryResult<SubscriptionDto> = safeCall { createSubscription(request) }
    suspend fun updateSubscription(id: String, request: SubscriptionUpsertRequest): RepositoryResult<SubscriptionDto> = safeCall { updateSubscription(id, request) }
    suspend fun deleteSubscription(id: String): RepositoryResult<OkResponse> = safeCall { deleteSubscription(id) }
    suspend fun renderSubscription(request: RenderSubscriptionRequest): RepositoryResult<RenderSubscriptionResponse> = safeCall { renderSubscription(request) }

    suspend fun settings(): RepositoryResult<SettingsDto> = safeCall { settings() }
    suspend fun updateSettings(settings: Map<String, Any?>): RepositoryResult<SettingsDto> = safeCall { updateSettings(settings) }
}
