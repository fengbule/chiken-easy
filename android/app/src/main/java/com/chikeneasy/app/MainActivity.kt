package com.chikeneasy.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.chikeneasy.app.ui.AppViewModelFactory
import com.chikeneasy.app.ui.dashboard.DashboardScreen
import com.chikeneasy.app.ui.login.LoginScreen
import com.chikeneasy.app.ui.login.LoginViewModel
import com.chikeneasy.app.ui.nodepool.NodePoolScreen
import com.chikeneasy.app.ui.serverdetail.ServerDetailScreen
import com.chikeneasy.app.ui.servers.ServersScreen
import com.chikeneasy.app.ui.settings.SettingsScreen
import com.chikeneasy.app.ui.sftp.SftpScreen
import com.chikeneasy.app.ui.subscriptions.SubscriptionsScreen
import com.chikeneasy.app.ui.terminal.TerminalScreen
import com.chikeneasy.app.ui.theme.ChikenEasyTheme

class MainActivity : ComponentActivity() {
    private val factory by lazy { AppViewModelFactory((application as ChikenEasyApp).container) }
    private val loginViewModel by viewModels<LoginViewModel> { factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ChikenEasyTheme {
                ChikenEasyRoot(factory, loginViewModel)
            }
        }
    }
}

private data class BottomDestination(val route: String, val label: String, val icon: ImageVector)

private val bottomDestinations = listOf(
    BottomDestination("dashboard", "Dashboard", Icons.Outlined.Home),
    BottomDestination("servers", "Servers", Icons.Outlined.Dns),
    BottomDestination("terminalHub", "Terminal", Icons.Outlined.Terminal),
    BottomDestination("nodes", "Node Pool", Icons.Outlined.Hub),
    BottomDestination("settings", "Settings", Icons.Outlined.Settings)
)

@Composable
fun ChikenEasyRoot(factory: AppViewModelFactory, loginViewModel: LoginViewModel) {
    val loginState by loginViewModel.state.collectAsState()
    if (!loginState.authenticated) {
        LoginScreen(loginViewModel)
        return
    }

    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route.orEmpty()
    val selectedRoute = bottomDestinations.firstOrNull { currentRoute.startsWith(it.route) }?.route ?: "dashboard"

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomDestinations.forEach { destination ->
                    NavigationBarItem(
                        selected = selectedRoute == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo("dashboard") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "dashboard",
            modifier = Modifier.padding(padding)
        ) {
            composable("dashboard") {
                DashboardScreen(viewModel(factory = factory))
            }
            composable("servers") {
                ServersScreen(
                    viewModel = viewModel(factory = factory),
                    openDetail = { navController.navigate("server/$it") }
                )
            }
            composable(
                "server/{agentId}",
                arguments = listOf(navArgument("agentId") { type = NavType.StringType })
            ) { entry ->
                ServerDetailScreen(
                    agentId = entry.arguments?.getString("agentId").orEmpty(),
                    viewModel = viewModel(factory = factory),
                    openTerminal = { navController.navigate("terminalHub?agentId=$it") }
                )
            }
            composable("terminalHub") {
                TerminalHub(factory, PaddingValues(0.dp))
            }
            composable(
                "terminalHub?agentId={agentId}",
                arguments = listOf(navArgument("agentId") { defaultValue = "" })
            ) {
                TerminalHub(factory, PaddingValues(0.dp), it.arguments?.getString("agentId").orEmpty())
            }
            composable("nodes") {
                NodePoolScreen(viewModel(factory = factory))
            }
            composable("settings") {
                SettingsScreen(
                    viewModel = viewModel(factory = factory),
                    onLoggedOut = { loginViewModel.markLoggedOut() }
                )
            }
        }
    }
}

@Composable
private fun TerminalHub(factory: AppViewModelFactory, padding: PaddingValues, initialAgentId: String = "") {
    var selectedTab by remember { mutableStateOf(0) }
    Column(Modifier.fillMaxSize().padding(padding)) {
        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Terminal") }, icon = { Icon(Icons.Outlined.Terminal, contentDescription = null) })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("SFTP") }, icon = { Icon(Icons.Outlined.Folder, contentDescription = null) })
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Subscriptions") })
        }
        when (selectedTab) {
            0 -> TerminalScreen(viewModel(factory = factory), initialAgentId)
            1 -> SftpScreen(viewModel(factory = factory))
            2 -> SubscriptionsScreen(viewModel(factory = factory))
        }
    }
}
