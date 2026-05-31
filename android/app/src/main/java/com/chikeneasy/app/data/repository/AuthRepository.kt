package com.chikeneasy.app.data.repository

import com.chikeneasy.app.data.api.ApiClientFactory
import com.chikeneasy.app.data.model.AuthSessionRequest
import com.chikeneasy.app.data.storage.AppPreferences
import com.chikeneasy.app.util.ApiErrorParser
import com.chikeneasy.app.util.BaseUrlNormalizer
import retrofit2.HttpException
import java.io.IOException

class AuthRepository(
    private val preferences: AppPreferences,
    private val apiClientFactory: ApiClientFactory
) {
    val config = preferences.config

    suspend fun login(baseUrl: String, token: String): RepositoryResult<Unit> {
        val normalized = try {
            BaseUrlNormalizer.normalize(baseUrl)
        } catch (error: IllegalArgumentException) {
            return RepositoryResult.Failure(error.message ?: "Invalid panel address", error)
        }
        val cleanToken = token.trim()
        if (cleanToken.isBlank()) return RepositoryResult.Failure("API token is required")
        return try {
            val api = apiClientFactory.api(normalized) { cleanToken }
            api.authSession(AuthSessionRequest(cleanToken))
            preferences.saveConnection(normalized, cleanToken)
            RepositoryResult.Success(Unit)
        } catch (error: HttpException) {
            RepositoryResult.Failure(ApiErrorParser.parse(error.response()?.errorBody()?.string(), error.message()), error)
        } catch (error: IOException) {
            RepositoryResult.Failure(error.message ?: "Network unavailable", error)
        } catch (error: Throwable) {
            RepositoryResult.Failure(error.message ?: "Login failed", error)
        }
    }

    suspend fun verifySavedSession(): RepositoryResult<Unit> {
        val config = preferences.currentConfig()
        val token = preferences.token()
        if (config.baseUrl.isBlank() || token.isBlank()) return RepositoryResult.Failure("No saved session")
        return login(config.baseUrl, token)
    }

    suspend fun logout() {
        runCatching {
            val api = apiClientFactory.api(preferences.currentConfig().baseUrl) { preferences.token() }
            api.deleteSession()
        }
        preferences.clear()
    }
}
