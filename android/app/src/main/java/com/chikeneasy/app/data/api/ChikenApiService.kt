package com.chikeneasy.app.data.api

import com.chikeneasy.app.data.model.AuthSessionRequest
import com.chikeneasy.app.data.model.ConfigVersionDto
import com.chikeneasy.app.data.model.DashboardDto
import com.chikeneasy.app.data.model.AgentDto
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
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface ChikenApiService {
    @POST("api/auth/session")
    suspend fun authSession(@Body request: AuthSessionRequest): OkResponse

    @DELETE("api/auth/session")
    suspend fun deleteSession(): OkResponse

    @GET("api/dashboard")
    suspend fun dashboard(): DashboardDto

    @GET("api/agents")
    suspend fun agents(): List<AgentDto>

    @GET("api/agents/{id}")
    suspend fun agent(@Path("id") id: String): AgentDto

    @POST("api/agents/{id}/service/{action}")
    suspend fun serviceAction(@Path("id") id: String, @Path("action") action: String): OkResponse

    @GET("api/agents/{id}/config")
    suspend fun agentConfig(@Path("id") id: String): OkResponse

    @GET("api/agents/{id}/config/versions")
    suspend fun configVersions(@Path("id") id: String): List<ConfigVersionDto>

    @GET("api/agents/{id}/sftp")
    suspend fun sftpList(@Path("id") id: String, @Query("path") path: String): SftpListDto

    @Multipart
    @POST("api/agents/{id}/sftp/upload")
    suspend fun sftpUpload(@Path("id") id: String, @Part file: MultipartBody.Part, @Part("directory") directory: okhttp3.RequestBody): OkResponse

    @Streaming
    @GET("api/agents/{id}/sftp/download")
    suspend fun sftpDownload(@Path("id") id: String, @Query("path") path: String): ResponseBody

    @DELETE("api/agents/{id}/sftp")
    suspend fun sftpDelete(@Path("id") id: String, @Query("path") path: String): OkResponse

    @POST("api/agents/{id}/sftp/mkdir")
    suspend fun sftpMkdir(@Path("id") id: String, @Body request: PathRequest): OkResponse

    @POST("api/agents/{id}/sftp/rename")
    suspend fun sftpRename(@Path("id") id: String, @Body request: RenameRequest): OkResponse

    @GET("api/node-pool")
    suspend fun nodePool(): List<NodeDto>

    @GET("api/node-pool/{id}")
    suspend fun nodeDetail(@Path("id") id: String): NodeDto

    @POST("api/node-pool/import")
    suspend fun nodeImport(@Body request: NodeImportRequest): NodeImportResponse

    @POST("api/node-pool/from-agent/{id}")
    suspend fun nodeFromAgent(@Path("id") id: String): OkResponse

    @PUT("api/node-pool/{id}")
    suspend fun nodeUpdate(@Path("id") id: String, @Body patch: Map<String, Any?>): NodeDto

    @DELETE("api/node-pool/{id}")
    suspend fun nodeDelete(@Path("id") id: String): OkResponse

    @POST("api/node-pool/check")
    suspend fun nodeCheck(@Body request: NodeCheckRequest): NodeCheckResponse

    @Streaming
    @GET("api/node-pool/export")
    suspend fun nodeExport(@Query("format") format: String = "clash"): ResponseBody

    @GET("api/subscriptions/meta")
    suspend fun subscriptionMeta(): SubscriptionMetaDto

    @GET("api/subscriptions")
    suspend fun subscriptions(): List<SubscriptionDto>

    @GET("api/subscriptions/{id}")
    suspend fun subscription(@Path("id") id: String): SubscriptionDto

    @POST("api/subscriptions")
    suspend fun createSubscription(@Body request: SubscriptionUpsertRequest): SubscriptionDto

    @PUT("api/subscriptions/{id}")
    suspend fun updateSubscription(@Path("id") id: String, @Body request: SubscriptionUpsertRequest): SubscriptionDto

    @DELETE("api/subscriptions/{id}")
    suspend fun deleteSubscription(@Path("id") id: String): OkResponse

    @POST("api/subscriptions/render")
    suspend fun renderSubscription(@Body request: RenderSubscriptionRequest): RenderSubscriptionResponse

    @GET("api/settings")
    suspend fun settings(): SettingsDto

    @PUT("api/settings")
    suspend fun updateSettings(@Body settings: Map<String, Any?>): SettingsDto
}
