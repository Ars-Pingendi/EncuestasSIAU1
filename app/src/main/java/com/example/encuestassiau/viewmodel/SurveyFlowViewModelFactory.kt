package com.example.encuestassiau.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.encuestassiau.data.Repository

class SurveyFlowViewModelFactory(
    private val repository: Repository
) : ViewModelProvider.Factory {

    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(SurveyFlowViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return SurveyFlowViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
