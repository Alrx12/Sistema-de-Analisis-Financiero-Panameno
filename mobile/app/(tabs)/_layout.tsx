/**
 * Tab Navigator — navegación principal
 * Tabs visibles: Inicio, Subir, Análisis, Entrenar, Presupuesto, Cuenta
 * Ocultos (stack desde Cuenta): Simulaciones, Ayuda
 */
import { Tabs } from "expo-router"
import { Ionicons } from "@expo/vector-icons"

type IoniconName = React.ComponentProps<typeof Ionicons>["name"]

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={24} color={color} />
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#e05c19",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e7eb",
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 4,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Inicio",
          tabBarIcon: tabIcon("bar-chart-outline", "bar-chart"),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "Subir",
          tabBarIcon: tabIcon("cloud-upload-outline", "cloud-upload"),
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: "Análisis",
          tabBarIcon: tabIcon("search-outline", "search"),
        }}
      />
      <Tabs.Screen
        name="retrain"
        options={{
          title: "Entrenar",
          tabBarIcon: tabIcon("bulb-outline", "bulb"),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          tabBarLabel: "50/30/20",
          tabBarIcon: tabIcon("pie-chart-outline", "pie-chart"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Cuenta",
          tabBarIcon: tabIcon("person-circle-outline", "person-circle"),
        }}
      />

      {/* Pantallas ocultas — accesibles desde Cuenta */}
      <Tabs.Screen
        name="simulaciones"
        options={{
          title: "Simulaciones",
          href: null,  // No aparece en el tab bar
        }}
      />
      <Tabs.Screen
        name="ayuda"
        options={{
          title: "Ayuda",
          href: null,
        }}
      />
    </Tabs>
  )
}
