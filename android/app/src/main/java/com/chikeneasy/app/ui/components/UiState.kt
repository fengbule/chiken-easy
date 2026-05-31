package com.chikeneasy.app.ui.components

sealed interface LoadState<out T> {
    data object Idle : LoadState<Nothing>
    data object Loading : LoadState<Nothing>
    data class Data<T>(val value: T) : LoadState<T>
    data class Error(val message: String) : LoadState<Nothing>
}
