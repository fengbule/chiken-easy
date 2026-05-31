package com.chikeneasy.app.data.repository

import com.chikeneasy.app.data.api.ApiClientFactory
import com.chikeneasy.app.data.api.ChikenApiService
import com.chikeneasy.app.data.storage.AppPreferences
import com.chikeneasy.app.util.ApiErrorParser
import retrofit2.HttpException
import java.io.IOException

open class BaseRepository(
    private val preferences: AppPreferences,
    private val apiClientFactory: ApiClientFactory
) {
    protected suspend fun api(): ChikenApiService {
        val config = preferences.currentConfig()
        return apiClientFactory.api(config.baseUrl) { preferences.token() }
    }

    protected suspend fun <T> safeCall(block: suspend ChikenApiService.() -> T): RepositoryResult<T> {
        return try {
            RepositoryResult.Success(api().block())
        } catch (error: HttpException) {
            val body = error.response()?.errorBody()?.string()
            RepositoryResult.Failure(ApiErrorParser.parse(body, error.message()), error)
        } catch (error: IOException) {
            RepositoryResult.Failure(error.message ?: "Network unavailable", error)
        } catch (error: IllegalArgumentException) {
            RepositoryResult.Failure(error.message ?: "Invalid configuration", error)
        } catch (error: Throwable) {
            RepositoryResult.Failure(error.message ?: "Request failed", error)
        }
    }
}
