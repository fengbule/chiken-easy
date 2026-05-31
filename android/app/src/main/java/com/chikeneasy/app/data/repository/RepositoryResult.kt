package com.chikeneasy.app.data.repository

sealed interface RepositoryResult<out T> {
    data class Success<T>(val value: T) : RepositoryResult<T>
    data class Failure(val message: String, val cause: Throwable? = null) : RepositoryResult<Nothing>
}

inline fun <T> RepositoryResult<T>.onSuccess(block: (T) -> Unit): RepositoryResult<T> {
    if (this is RepositoryResult.Success) block(value)
    return this
}

fun RepositoryResult<*>.errorOrNull(): String? = (this as? RepositoryResult.Failure)?.message
