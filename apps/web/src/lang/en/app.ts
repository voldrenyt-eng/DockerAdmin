export const app = {
  auth: {
    apiHint:
      "The same API base handles login, refresh, logout, and guarded runtime calls.",
    emailLabel: "Email",
    emailPlaceholder: "admin@example.com",
    errorFallback: "Login failed",
    eyebrow: "Admin sign-in",
    hint: "Use the seeded admin credentials to unlock the existing runtime dashboard.",
    logout: "Log out",
    panelBadge: "JWT + Refresh",
    panelEyebrow: "Access",
    panelSummary:
      "Start with a real admin session, then drive metrics and runtime actions through the guarded API.",
    panelTitle: "Sign in to continue",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter admin password",
    sessionExpired: "Session expired. Sign in again.",
    sessionHint:
      "This browser keeps the current admin session locally for the MVP flow.",
    sessionLabel: "Signed in as",
    storageHint:
      "Access and refresh tokens stay only in this browser storage for the MVP shell.",
    storageLabel: "Session model",
    storageValue: "Local session",
    submitIdle: "Sign in",
    submitLoading: "Signing in...",
    summary:
      "Authenticate first, then continue inside the same portal dashboard without hand-pasting bearer tokens.",
    title: "Admin login",
  },
  error: {
    summaryPrefix:
      "Web still parses standardized API errors through the shared DTO package, even inside the redesigned dashboard shell.",
    title: "Shared API error contract",
  },
  hero: {
    breadcrumbCurrent: "Dashboard",
    breadcrumbLabel: "Overview",
    eyebrow: "Admin workspace",
    summary:
      "Keep one project runtime under view, watch service pressure, and keep the metrics session wired into the same shell.",
    title: "Runtime control center",
  },
  kpis: {
    cpu: {
      detail: "average runtime load",
      label: "Average CPU",
    },
    memory: {
      detail: "live working set",
      label: "Memory usage",
    },
    services: {
      detail: "services visible in runtime",
      label: "Active services",
    },
    traffic: {
      detail: "combined network flow",
      label: "Network traffic",
    },
  },
  metrics: {
    accessTokenHint:
      "Paste a current admin bearer token. The value stays only in this browser storage for local MVP testing.",
    accessTokenLabel: "Access token",
    accessTokenPlaceholder: "Paste admin bearer token",
    columns: {
      cpu: "CPU %",
      memoryLimit: "Memory limit",
      memoryUsage: "Memory usage",
      networkRx: "Network RX",
      networkTx: "Network TX",
      service: "Service",
    },
    description:
      "Poll the guarded metrics endpoint roughly every 5 seconds for one project runtime.",
    emptyConfig: "Enter a project id to start live polling.",
    emptyData: "No runtime metrics returned for this project yet.",
    errorPrefix: "Metrics error:",
    intervalHint:
      "Polling stops automatically when this page unmounts or the browser tab is closed.",
    lastUpdatedPrefix: "Last updated:",
    loading: "Loading metrics...",
    projectIdHint: "Use the backend project id, not the project slug.",
    projectIdLabel: "Project id",
    projectIdPlaceholder: "project_1",
    refreshing: "Refreshing metrics...",
    title: "Live metrics",
  },
  projects: {
    breadcrumbCurrent: "Projects",
    breadcrumbLabel: "Workspace",
    columns: {
      actions: "Action",
      name: "Name",
      slug: "Slug",
      sourceType: "Source type",
    },
    create: {
      action: "Create Project",
      cancel: "Cancel",
      close: "Close",
      closedHint:
        "Open this panel to create a project and attach its first source.",
      completed: "Project created and source attached.",
      continueIdle: "Continue",
      continueLoading: "Creating project...",
      eyebrow: "Project intake",
      gitBranchLabel: "Branch (optional)",
      gitBranchPlaceholder: "main",
      gitSubmitIdle: "Clone repository",
      gitSubmitLoading: "Cloning repository...",
      gitUrlLabel: "Git URL",
      gitUrlPlaceholder: "https://github.com/example/repo.git",
      metadataCreated: "Project metadata created. Continue with source setup.",
      metadataHint:
        "Start with the name and source type, then continue to ZIP or Git source setup.",
      nameLabel: "Project name",
      namePlaceholder: "Storefront runtime",
      pendingLabel: "Pending project",
      sourceHint:
        "Finish the source step to complete this project flow in the UI.",
      sourceTypeLabel: "Source type",
      summary:
        "Create project metadata first, then attach ZIP or Git source in the same panel.",
      title: "Create Project",
      zipHint: "Choose the initial ZIP archive for this project.",
      zipLabel: "ZIP archive",
      zipSubmitIdle: "Upload ZIP",
      zipSubmitLoading: "Uploading ZIP...",
    },
    detail: {
      activeTabLabel: "Active section",
      backAction: "Back to projects",
      content: {
        deployments: {
          description:
            "This route now shows the latest deployment state, a manual deploy action, and a compact recent history.",
          endpointHint:
            "The panel reads newest-first deployment history and reuses the guarded deploy trigger endpoint.",
          nextStep:
            "A later batch can add polling or deploy log drilldown without moving the route.",
          summary:
            "Deploy the current project and review the latest deployment history.",
        },
        domains: {
          description:
            "This route now shows current domain bindings and a create or delete workflow for the selected project.",
          endpointHint:
            "The panel filters guarded domain data to the current project and reuses the existing create or delete endpoints.",
          nextStep:
            "A later batch can add edit flows or stronger DNS validation hints without moving the route.",
          summary:
            "Manage current project domain bindings and create new guarded host routes.",
        },
        env: {
          description:
            "This route reserves the final editor location for guarded env read and write flows.",
          endpointHint:
            "The backend already supports project env read today, and edit UI lands next.",
          nextStep:
            "E10-5 can plug the env editor into this route without moving navigation.",
          summary: "Env shell for encrypted project environment editing.",
        },
        logs: {
          description:
            "This route now combines service selection, one guarded HTTP snapshot, and live websocket log append.",
          endpointHint:
            "The panel uses the existing HTTP logs snapshot plus the authenticated websocket stream for follow mode.",
          nextStep:
            "A later batch can add richer filtering or multi-service views without changing the route.",
          summary:
            "Review one service log stream with a guarded snapshot and live websocket updates.",
        },
        services: {
          description:
            "This route now shows the live project service inventory and row-level runtime actions.",
          endpointHint:
            "The panel reads guarded runtime services and reuses the existing action endpoint for start, stop, and restart.",
          nextStep:
            "A later batch can add richer runtime diagnostics without moving the route.",
          summary:
            "Review live runtime services and trigger guarded service actions from this route.",
        },
      },
      domainActions: {
        delete: "Delete",
      },
      domainsPanel: {
        createSuccess: "Domain binding created.",
        deleteAction: "Delete",
        deleteLoading: "Deleting...",
        deleteSuccess: "Domain binding deleted.",
        domainLabel: "Domain",
        empty: "No domain bindings yet for this project.",
        hint: "Create bindings against the current runtime services only.",
        hostLabel: "Host",
        hostPlaceholder: "demo.example.com",
        loading: "Loading project domains...",
        noServicesHint:
          "Runtime services are required before a domain binding can be created.",
        portLabel: "Port",
        portPlaceholder: "8080",
        serviceLabel: "Target service",
        submitIdle: "Create domain",
        submitLoading: "Creating domain...",
        tlsDisabled: "TLS off",
        tlsEnabled: "TLS on",
        tlsLabel: "Enable TLS",
      },
      endpointLabel: "Primary endpoint",
      deploymentStatuses: {
        FAILED: "Failed",
        RUNNING: "Running",
        SUCCESS: "Success",
      },
      deploymentsPanel: {
        deployIdle: "Deploy",
        deployLoading: "Deploying...",
        emptyHistory:
          "No deployments yet. Trigger the first deploy from this tab.",
        emptyLatest: "No deployment recorded yet.",
        failedNotice: "Deploy finished with a failed status.",
        finishedAtLabel: "Finished at",
        hint: "Manual deploy runs through the existing backend pipeline and refreshes history on completion.",
        historyLabel: "Recent history",
        historyTitle: "Newest deployment records",
        latestLabel: "Latest deployment",
        loading: "Loading deployment history...",
        notFinishedValue: "Still running",
        runningNotice:
          "The latest deployment is still running, so manual re-trigger stays disabled.",
        sourceLabel: "Source",
        startedAtLabel: "Started at",
        statusEmpty: "No history",
        successNotice: "Deploy finished successfully.",
        triggerLabel: "Trigger",
      },
      deploymentTriggers: {
        manual: "Manual",
        system: "System",
      },
      envEditor: {
        emptyNotice: "No env file yet. Start with KEY=VALUE lines and save.",
        hint: "Content is stored as raw .env text and encrypted at rest.",
        inputLabel: "Environment content",
        inputPlaceholder: "# APP_ENV=production\n# API_URL=https://example.com",
        loading: "Loading project env...",
        reloadAction: "Reload",
        saveIdle: "Save env",
        saveLoading: "Saving env...",
        saveSuccess: "Project env saved.",
        statusPill: "Encrypted",
      },
      errorPrefix: "Project error:",
      errors: {
        createDomainFallback: "Failed to create domain",
        deployFallback: "Failed to trigger deploy",
        deleteDomainFallback: "Failed to delete domain",
        loadFallback: "Failed to load project",
        loadDeploymentsFallback: "Failed to load deployment history",
        loadDomainsFallback: "Failed to load project domains",
        loadEnvFallback: "Failed to load project env",
        loadLogsFallback: "Failed to load project logs",
        loadServicesFallback: "Failed to load project services",
        saveEnvFallback: "Failed to save project env",
        serviceActionFallback: "Failed to update service state",
      },
      headerEyebrow: "Project shell",
      headerSummary:
        "Project identity stays visible here while runtime, logs, domains, deployments, and env workflows settle into dedicated routes.",
      idHint:
        "Use this backend project id when calling guarded runtime endpoints.",
      idLabel: "Project id",
      loadingBody: "Loading project metadata for this route...",
      loadingTitle: "Loading project...",
      pageSummary:
        "Each tab already has its own stable URL, so later batches can land interactive features without changing navigation.",
      pageTitle: "Project detail",
      panelEyebrow: "Route shell",
      panelTitle: "Project detail",
      logsPanel: {
        connectionStates: {
          connecting: "Connecting",
          idle: "Idle",
          live: "Live",
        },
        emptyLogs: "No log lines yet for the selected service.",
        emptyServices: "No services available yet for log streaming.",
        hint: "The tab loads one HTTP snapshot first, then appends live websocket frames.",
        loadingServices: "Loading services for logs...",
        loadingSnapshot: "Loading log snapshot...",
        serviceLabel: "Service",
        socketUnavailable:
          "WebSocket is not available in this environment, so only the snapshot is shown.",
        streamConnectFallback: "Live log stream could not connect.",
        streamFrameFallback: "Live log stream returned an unreadable frame.",
      },
      shellLabel: "UI status",
      shellValue: "Shell ready",
      slugHint: "Stable runtime slug used by deploy and runtime integrations.",
      slugLabel: "Slug",
      sourceTypeHint: "Initial source mode selected during project creation.",
      sourceTypeLabel: "Source type",
      serviceActions: {
        restart: "Restart",
        start: "Start",
        stop: "Stop",
      },
      serviceStatuses: {
        running: "Running",
        starting: "Starting",
        stopped: "Stopped",
        unknown: "Unknown",
      },
      servicesPanel: {
        actionLoading: "Applying...",
        actionSuccess: "Service action applied.",
        actionUnavailable:
          "This runtime service is missing a stable action id, so controls stay disabled.",
        empty: "No runtime services found for this project.",
        hint: "Actions run against the current runtime and refresh the list after completion.",
        imageLabel: "Image",
        loading: "Loading project services...",
        noPortsValue: "No published ports",
        notStartedValue: "Not started",
        portsLabel: "Ports",
        serviceLabel: "Service",
        startedAtLabel: "Started at",
      },
      tabs: {
        deployments: "Deployments",
        domains: "Domains",
        env: "Env",
        logs: "Logs",
        services: "Services",
      },
      tabsAriaLabel: "Project detail sections",
    },
    empty: "No projects yet. Create the first one from this page.",
    errorPrefix: "Projects error:",
    errors: {
      createFallback: "Project setup failed",
      listFallback: "Failed to load projects",
      zipRequired: "A ZIP archive is required.",
    },
    eyebrow: "Project catalog",
    listSummary:
      "Review current projects and start new ZIP or Git-backed runtimes without leaving the protected portal.",
    listTitle: "Projects",
    loading: "Loading projects...",
    pageSummary:
      "Create new project metadata and attach the first source in one guarded admin flow.",
    pageTitle: "Projects workspace",
    openAction: "Open",
    sourceTypes: {
      git: "Git",
      manual: "Manual",
      zip: "ZIP",
    },
  },
  audit: {
    breadcrumbCurrent: "Audit",
    breadcrumbLabel: "Security",
    columns: {
      action: "Action",
      entityType: "Entity",
      message: "Message",
      project: "Project",
      timestamp: "Timestamp",
    },
    empty: "No audit records yet.",
    emptyValue: "—",
    errorPrefix: "Audit error:",
    errors: {
      exportFallback: "Failed to export audit log",
      listFallback: "Failed to load audit log",
    },
    export: {
      action: "Export CSV",
      loading: "Exporting CSV...",
    },
    filteredEmpty: "No audit records match the current filters.",
    drawer: {
      close: "Close",
      fields: {
        entityId: "Entity id",
        userId: "User id",
      },
      summary:
        "Inspect the full selected audit record without leaving the current filtered list.",
      title: "Record detail",
    },
    filters: {
      actionAll: "All actions",
      actionLabel: "Action",
      entityTypeAll: "All entities",
      entityTypeLabel: "Entity type",
      searchLabel: "Search records",
      searchPlaceholder: "Search by action, entity, project, or message",
    },
    eyebrow: "Audit trail",
    listTitle: "Latest records",
    loading: "Loading audit trail...",
    pageSummary:
      "Review the latest guarded admin actions already persisted by the backend audit API.",
    pageTitle: "Audit trail",
    pagination: {
      next: "Next",
      previous: "Previous",
      rangeLabel: "Visible rows",
    },
    panelSummary:
      "This page stays read-only and shows the newest audit entries first.",
  },
  nav: {
    ariaLabel: "Primary dashboard navigation",
    badges: {
      live: "LIVE",
    },
    audit: "Audit",
    dashboard: "Dashboard",
    deployments: "Deployments",
    logs: "Logs",
    projects: "Projects",
    services: "Services",
    settings: "Settings",
  },
  pressure: {
    cpuLegend: "CPU",
    eyebrow: "Pressure split",
    memoryLegend: "Memory",
    summary:
      "Compare the heaviest services by compute pressure without leaving the overview canvas.",
    title: "Service pressure",
  },
  runtime: {
    awaitingUpdate: "Awaiting first poll",
    connectionHealthy: "Waiting for the next scheduled refresh is safe.",
    connectionLabel: "Session state",
    connectionPending: "Awaiting credentials",
    connectionReady: "Live session armed",
    demoBadge: "DEMO",
    lastUpdatedLabel: "Last refresh",
    liveBadge: "LIVE",
    memoryHeadroomLabel: "Memory headroom",
    overviewSummary:
      "The main card keeps the real metrics session visible while the chart area adopts the new portal dashboard language.",
    overviewTitle: "Runtime overview",
    peakCpuLabel: "Peak CPU",
    projectLabel: "Project target",
    projectPlaceholder: "No project selected",
  },
  services: {
    empty:
      "Connect a runtime session to replace the empty state with live service rows.",
    eyebrow: "Runtime list",
    status: {
      healthy: "Healthy",
      idle: "Idle",
      watch: "Watch",
    },
    statusColumn: "Status",
    summary:
      "The bottom table stays factual: service, CPU, memory, traffic, and a lightweight pressure badge.",
    title: "Recent services",
    trafficColumn: "Traffic",
  },
  sidebar: {
    environmentConnected: "Runtime connected",
    environmentLabel: "Environment",
    environmentPending: "Awaiting metrics session",
  },
  tools: {
    apiBaseLabel: "API base URL",
    eyebrow: "Workspace tools",
    localeLabel: "Interface language",
    summary:
      "Keep the project target, locale, and the shared API contract in one operational card.",
    title: "Control panel",
  },
  topbar: {
    alertsCalm: "No active alerts",
    alertsWarning: "Review metrics warning",
    commandHint: "Ctrl K",
    searchPlaceholder: "Search services, logs, or deployments",
    sessionLive: "Runtime live",
    sessionPending: "Session pending",
    userName: "Admin user",
    userRole: "Operations",
  },
} as const;
