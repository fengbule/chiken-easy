package com.chikeneasy.app.data.model

data class AuthSessionRequest(
    val token: String
)

data class OkResponse(
    val ok: Boolean? = null,
    val commandId: String? = null,
    val output: String? = null,
    val error: String? = null,
    val config: Map<String, JsonElement?>? = null,
    val path: String? = null,
    val size: Long? = null
)

data class DashboardDto(
    val total: Int? = null,
    val online: Int? = null,
    val offline: Int? = null,
    val activeSingbox: Int? = null,
    val averageCpu: Double? = null,
    val totalRxRate: Double? = null,
    val totalTxRate: Double? = null,
    val recent: List<AgentDto>? = null,
    val securityWarnings: JsonElement? = null
)

data class AgentDto(
    val id: String = "",
    val name: String? = null,
    val host: String? = null,
    val ip: String? = null,
    val arch: String? = null,
    val os: String? = null,
    val tags: List<String>? = null,
    val group: String? = null,
    val region: String? = null,
    val provider: String? = null,
    val singboxVersion: String? = null,
    val singboxStatus: String? = null,
    val connected: Boolean? = null,
    val lastSeen: String? = null,
    val registeredAt: String? = null,
    val certFingerprint: String? = null,
    val sshConfigured: Boolean? = null,
    val sshHost: String? = null,
    val sshPort: Int? = null,
    val sshMode: String? = null,
    val metrics: MetricsDto? = null,
    val asset: Map<String, JsonElement?>? = null,
    val metricsHistory: MetricsHistoryDto? = null,
    val networkTuning: Map<String, JsonElement?>? = null,
    val lastConfig: Map<String, JsonElement?>? = null,
    val memos: List<MemoDto>? = null
)

data class MetricsDto(
    val cpu: UsageDto? = null,
    val memory: UsageDto? = null,
    val disk: UsageDto? = null,
    val network: NetworkDto? = null,
    val uptime: Double? = null
)

data class UsageDto(
    val usage: Double? = null,
    val used: Double? = null,
    val total: Double? = null
)

data class NetworkDto(
    val rxRate: Double? = null,
    val txRate: Double? = null,
    val rxBytes: Double? = null,
    val txBytes: Double? = null
)

data class MetricsHistoryDto(
    val raw: List<MetricSampleDto>? = null,
    val aggregated: List<MetricSampleDto>? = null
)

data class MetricSampleDto(
    val updatedAt: String? = null,
    val cpuUsage: Double? = null,
    val memoryUsage: Double? = null,
    val diskUsage: Double? = null,
    val rxSpeed: Double? = null,
    val txSpeed: Double? = null,
    val uptime: Double? = null
)

data class MemoDto(
    val id: String? = null,
    val title: String? = null,
    val content: String? = null,
    val tags: List<String>? = null,
    val updatedAt: String? = null
)

data class ConfigVersionDto(
    val id: String? = null,
    val at: String? = null,
    val status: String? = null,
    val lastOutput: String? = null,
    val appliedAt: String? = null,
    val config: Map<String, JsonElement?>? = null
)

data class SftpListDto(
    val path: String? = null,
    val entries: List<SftpEntryDto>? = null
)

data class SftpEntryDto(
    val name: String = "",
    val longname: String? = null,
    val size: Long? = null,
    val modifiedAt: String? = null,
    val isDirectory: Boolean? = null
)

data class PathRequest(
    val path: String
)

data class RenameRequest(
    val oldPath: String,
    val newPath: String
)

data class NodeDto(
    val id: String = "",
    val name: String? = null,
    val protocol: String? = null,
    val address: String? = null,
    val port: Int? = null,
    val source: String? = null,
    val sourceId: String? = null,
    val tags: List<String>? = null,
    val group: String? = null,
    val region: String? = null,
    val enabled: Boolean? = null,
    val health: String? = null,
    val score: Double? = null,
    val lastCheckAt: String? = null,
    val lastError: String? = null,
    val lastCheckStatus: String? = null,
    val metadata: Map<String, JsonElement?>? = null,
    val checks: List<Map<String, JsonElement?>>? = null,
    val qualityHistory: List<Map<String, JsonElement?>>? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class NodeImportRequest(
    val content: String,
    val source: String = "android",
    val sourceId: String = "",
    val removeMissing: Boolean = false
)

data class NodeImportResponse(
    val ok: Boolean? = null,
    val nodes: List<NodeDto>? = null,
    val warnings: List<String>? = null,
    val changed: Boolean? = null,
    val error: String? = null
)

data class NodeCheckRequest(
    val nodeIds: List<String> = emptyList(),
    val checkedBy: String = "server",
    val agentId: String = "",
    val timeoutMs: Long = 10000,
    val url: String = ""
)

data class NodeCheckResponse(
    val ok: Boolean? = null,
    val results: List<Map<String, JsonElement?>>? = null,
    val error: String? = null
)

data class SubscriptionMetaDto(
    val templates: JsonElement? = null,
    val nodes: JsonElement? = null,
    val nodePool: List<NodeDto>? = null
)

data class SubscriptionDto(
    val id: String = "",
    val name: String? = null,
    val template: String? = null,
    val publicToken: String? = null,
    val url: String? = null,
    val format: String? = null,
    val nodeIds: List<String>? = null,
    val enabled: Boolean? = null,
    val expiresAt: String? = null,
    val maxAccessCount: Int? = null,
    val accessCount: Int? = null,
    val onlyHealthy: Boolean? = null,
    val sortBy: String? = null,
    val filterTags: List<String>? = null,
    val filterRegions: List<String>? = null,
    val localNodeCount: Int? = null,
    val importCount: Int? = null,
    val nodeCount: Int? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val localNodes: List<Map<String, JsonElement?>>? = null,
    val imports: List<Map<String, JsonElement?>>? = null
)

data class SubscriptionUpsertRequest(
    val id: String? = null,
    val name: String,
    val format: String = "clash",
    val enabled: Boolean = true,
    val nodeIds: List<String> = emptyList(),
    val localNodes: List<Map<String, JsonElement?>> = emptyList(),
    val imports: List<Map<String, JsonElement?>> = emptyList(),
    val onlyHealthy: Boolean = false,
    val sortBy: String = "name",
    val regenerateToken: Boolean = false
)

data class RenderSubscriptionRequest(
    val id: String? = null,
    val name: String = "preview",
    val format: String = "clash",
    val enabled: Boolean = true,
    val nodeIds: List<String> = emptyList(),
    val localNodes: List<Map<String, JsonElement?>> = emptyList(),
    val imports: List<Map<String, JsonElement?>> = emptyList(),
    val onlyHealthy: Boolean = false,
    val sortBy: String = "name"
)

data class RenderSubscriptionResponse(
    val body: String? = null,
    val content: String? = null,
    val profile: SubscriptionDto? = null,
    val error: String? = null
)

data class SettingsDto(
    val publicProbeRefreshSec: Int? = null,
    val alerts: Map<String, JsonElement?>? = null,
    val hasTelegramToken: Boolean? = null,
    val telegramChatId: String? = null,
    val hasWebhookUrl: Boolean? = null,
    val queryTokenEnabled: Boolean? = null,
    val masterKeySet: Boolean? = null,
    val storageMode: String? = null,
    val warnings: JsonElement? = null
)

sealed interface JsonElement {
    data object NullValue : JsonElement
    data class BooleanValue(val value: Boolean) : JsonElement
    data class NumberValue(val value: Double) : JsonElement
    data class StringValue(val value: String) : JsonElement
    data class ArrayValue(val value: List<JsonElement?>) : JsonElement
    data class ObjectValue(val value: Map<String, JsonElement?>) : JsonElement
}
