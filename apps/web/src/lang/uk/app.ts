export const app = {
  auth: {
    apiHint:
      "Ця сама API base адреса обслуговує login, refresh, logout і guarded runtime calls.",
    emailLabel: "Email",
    emailPlaceholder: "admin@example.com",
    errorFallback: "Login не вдався",
    eyebrow: "Admin sign-in",
    hint: "Використай seeded admin credentials, щоб увійти в існуючий runtime dashboard.",
    logout: "Вийти",
    panelBadge: "JWT + Refresh",
    panelEyebrow: "Доступ",
    panelSummary:
      "Почни з реальної admin session, а вже потім керуй метриками й runtime діями через guarded API.",
    panelTitle: "Увійди, щоб продовжити",
    passwordLabel: "Пароль",
    passwordPlaceholder: "Введи admin password",
    sessionExpired: "Сесію завершено. Увійди ще раз.",
    sessionHint:
      "Цей браузер локально тримає поточну admin session для MVP flow.",
    sessionLabel: "Увійшов як",
    storageHint:
      "Access і refresh token залишаються тільки в localStorage цього браузера для MVP shell.",
    storageLabel: "Модель сесії",
    storageValue: "Локальна сесія",
    submitIdle: "Увійти",
    submitLoading: "Виконую вхід...",
    summary:
      "Спочатку автентифікуйся, а потім працюй у тому самому portal dashboard без ручного вставляння bearer token.",
    title: "Admin login",
  },
  error: {
    summaryPrefix:
      "Web і далі читає стандартизовані помилки API через shared DTO пакет, навіть усередині нового dashboard shell.",
    title: "Спільний контракт помилок API",
  },
  hero: {
    breadcrumbCurrent: "Dashboard",
    breadcrumbLabel: "Огляд",
    eyebrow: "Admin workspace",
    summary:
      "Тримай один project runtime під наглядом, стеж за тиском сервісів і не втрачай live metrics session у новому shell.",
    title: "Центр контролю runtime",
  },
  kpis: {
    cpu: {
      detail: "середнє навантаження runtime",
      label: "Середній CPU",
    },
    memory: {
      detail: "поточний working set",
      label: "Використання пам'яті",
    },
    services: {
      detail: "сервіси, видимі в runtime",
      label: "Активні сервіси",
    },
    traffic: {
      detail: "сумарний network flow",
      label: "Мережевий трафік",
    },
  },
  metrics: {
    accessTokenHint:
      "Встав поточний admin bearer token. Значення зберігається лише в localStorage цього браузера для локального MVP тестування.",
    accessTokenLabel: "Access token",
    accessTokenPlaceholder: "Встав admin bearer token",
    columns: {
      cpu: "CPU %",
      memoryLimit: "Ліміт пам'яті",
      memoryUsage: "Використання пам'яті",
      networkRx: "Network RX",
      networkTx: "Network TX",
      service: "Сервіс",
    },
    description:
      "Опитуй guarded metrics endpoint приблизно раз на 5 секунд для одного project runtime.",
    emptyConfig: "Заповни project id, щоб запустити live polling.",
    emptyData: "Для цього project runtime поки немає метрик.",
    errorPrefix: "Помилка метрик:",
    intervalHint:
      "Polling автоматично зупиняється при unmount сторінки або закритті вкладки.",
    lastUpdatedPrefix: "Останнє оновлення:",
    loading: "Завантажую метрики...",
    projectIdHint: "Використовуй backend project id, а не project slug.",
    projectIdLabel: "Project id",
    projectIdPlaceholder: "project_1",
    refreshing: "Оновлюю метрики...",
    title: "Live metrics",
  },
  projects: {
    breadcrumbCurrent: "Projects",
    breadcrumbLabel: "Workspace",
    columns: {
      actions: "Дія",
      name: "Назва",
      slug: "Slug",
      sourceType: "Тип source",
    },
    create: {
      action: "Create Project",
      cancel: "Скасувати",
      close: "Закрити",
      closedHint:
        "Відкрий цю панель, щоб створити project і підв'язати його перший source.",
      completed: "Project створено і source підключено.",
      continueIdle: "Продовжити",
      continueLoading: "Створюю project...",
      eyebrow: "Project intake",
      gitBranchLabel: "Branch (optional)",
      gitBranchPlaceholder: "main",
      gitSubmitIdle: "Клонувати repository",
      gitSubmitLoading: "Клоную repository...",
      gitUrlLabel: "Git URL",
      gitUrlPlaceholder: "https://github.com/example/repo.git",
      metadataCreated:
        "Project metadata створені. Продовжуй налаштування source.",
      metadataHint:
        "Спершу задай назву і source type, а потім переходь до ZIP або Git setup.",
      nameLabel: "Назва project",
      namePlaceholder: "Storefront runtime",
      pendingLabel: "Pending project",
      sourceHint:
        "Заверши source step, щоб цей project flow вважався завершеним у UI.",
      sourceTypeLabel: "Source type",
      summary:
        "Спочатку створи project metadata, а потім у цій самій панелі підв'яжи ZIP або Git source.",
      title: "Create Project",
      zipHint: "Вибери стартовий ZIP archive для цього project.",
      zipLabel: "ZIP archive",
      zipSubmitIdle: "Завантажити ZIP",
      zipSubmitLoading: "Завантажую ZIP...",
    },
    detail: {
      activeTabLabel: "Активна секція",
      backAction: "Назад до проєктів",
      content: {
        deployments: {
          description:
            "Цей route тепер показує останній стан deploy, manual deploy action і компактну recent history.",
          endpointHint:
            "Панель читає newest-first history деплоїв і використовує guarded deploy trigger endpoint.",
          nextStep:
            "Наступний batch може додати polling або drilldown у deploy logs без зміни route.",
          summary:
            "Деплой поточного project і перегляд останньої history деплоїв.",
        },
        domains: {
          description:
            "Цей route тепер показує поточні domain bindings і create/delete workflow для вибраного project.",
          endpointHint:
            "Панель фільтрує guarded domain data до поточного project і використовує existing create/delete endpoints.",
          nextStep:
            "Наступний batch може додати edit flow або сильніші DNS hints без зміни route.",
          summary:
            "Керуй domain bindings поточного project і створюй нові guarded host routes.",
        },
        env: {
          description:
            "Цей route резервує фінальне місце для guarded env read/write flow.",
          endpointHint:
            "Backend уже підтримує project env read, а edit UI йде наступним batch-ем.",
          nextStep:
            "E10-5 зможе підключити env editor у цей route без зміни навігації.",
          summary: "Env shell для encrypted project environment editing.",
        },
        logs: {
          description:
            "Цей route тепер поєднує вибір service, один guarded HTTP snapshot і live websocket append.",
          endpointHint:
            "Панель використовує existing HTTP logs snapshot і authenticated websocket stream для follow mode.",
          nextStep:
            "Наступний batch може додати багатші фільтри або multi-service view без зміни route.",
          summary:
            "Переглядай log stream одного service через guarded snapshot і live websocket updates.",
        },
        services: {
          description:
            "Цей route тепер показує live service inventory project і row-level runtime actions.",
          endpointHint:
            "Панель читає guarded runtime services і використовує existing action endpoint для start, stop і restart.",
          nextStep:
            "Наступний batch може додати багатшу runtime diagnostics без зміни route.",
          summary:
            "Переглядай live runtime services і запускай guarded service actions з цього route.",
        },
      },
      domainActions: {
        delete: "Видалити",
      },
      domainsPanel: {
        createSuccess: "Domain binding створено.",
        deleteAction: "Видалити",
        deleteLoading: "Видаляю...",
        deleteSuccess: "Domain binding видалено.",
        domainLabel: "Domain",
        empty: "Для цього project ще немає domain bindings.",
        hint: "Створюй bindings тільки для поточних runtime services.",
        hostLabel: "Host",
        hostPlaceholder: "demo.example.com",
        loading: "Завантажую domains project...",
        noServicesHint:
          "Перед create domain binding потрібні runtime services.",
        portLabel: "Port",
        portPlaceholder: "8080",
        serviceLabel: "Цільовий service",
        submitIdle: "Створити domain",
        submitLoading: "Створюю domain...",
        tlsDisabled: "TLS off",
        tlsEnabled: "TLS on",
        tlsLabel: "Увімкнути TLS",
      },
      endpointLabel: "Основний endpoint",
      deploymentStatuses: {
        FAILED: "Failed",
        RUNNING: "Running",
        SUCCESS: "Success",
      },
      deploymentsPanel: {
        deployIdle: "Deploy",
        deployLoading: "Деплою...",
        emptyHistory:
          "Деплоїв ще не було. Запусти перший deploy з цієї вкладки.",
        emptyLatest: "Ще немає жодного recorded deploy.",
        failedNotice: "Deploy завершився зі статусом failed.",
        finishedAtLabel: "Завершено о",
        hint: "Manual deploy іде через наявний backend pipeline і перезавантажує history після завершення.",
        historyLabel: "Остання history",
        historyTitle: "Найновіші записи deploy",
        latestLabel: "Останній deploy",
        loading: "Завантажую history деплоїв...",
        notFinishedValue: "Ще виконується",
        runningNotice:
          "Останній deploy ще виконується, тому повторний manual trigger заблокований.",
        sourceLabel: "Source",
        startedAtLabel: "Стартував о",
        statusEmpty: "Без history",
        successNotice: "Deploy завершився успішно.",
        triggerLabel: "Trigger",
      },
      deploymentTriggers: {
        manual: "Manual",
        system: "System",
      },
      envEditor: {
        emptyNotice:
          "Env file ще не заданий. Почни з KEY=VALUE рядків і збережи.",
        hint: "Вміст зберігається як raw .env text і шифрується at rest.",
        inputLabel: "Вміст environment",
        inputPlaceholder: "# APP_ENV=production\n# API_URL=https://example.com",
        loading: "Завантажую project env...",
        reloadAction: "Перезавантажити",
        saveIdle: "Зберегти env",
        saveLoading: "Зберігаю env...",
        saveSuccess: "Project env збережено.",
        statusPill: "Encrypted",
      },
      errorPrefix: "Помилка project:",
      errors: {
        createDomainFallback: "Не вдалося створити domain",
        deployFallback: "Не вдалося запустити deploy",
        deleteDomainFallback: "Не вдалося видалити domain",
        loadFallback: "Не вдалося завантажити project",
        loadDeploymentsFallback: "Не вдалося завантажити history деплоїв",
        loadDomainsFallback: "Не вдалося завантажити domains project",
        loadEnvFallback: "Не вдалося завантажити project env",
        loadLogsFallback: "Не вдалося завантажити project logs",
        loadServicesFallback: "Не вдалося завантажити project services",
        saveEnvFallback: "Не вдалося зберегти project env",
        serviceActionFallback: "Не вдалося оновити стан service",
      },
      headerEyebrow: "Project shell",
      headerSummary:
        "Ідентичність project залишається видимою тут, поки runtime, logs, domains, deployments і env workflow переходять на окремі route.",
      idHint:
        "Використовуй цей backend project id для guarded runtime endpoint-ів.",
      idLabel: "Project id",
      loadingBody: "Завантажую metadata project для цього route...",
      loadingTitle: "Завантажую project...",
      pageSummary:
        "Кожна вкладка вже має власний stable URL, тож наступні batch-і можуть додавати interactive features без зміни навігації.",
      pageTitle: "Project detail",
      panelEyebrow: "Route shell",
      panelTitle: "Project detail",
      logsPanel: {
        connectionStates: {
          connecting: "Connecting",
          idle: "Idle",
          live: "Live",
        },
        emptyLogs: "Для вибраного service ще немає log lines.",
        emptyServices: "Ще немає services для log streaming.",
        hint: "Вкладка спочатку вантажить один HTTP snapshot, а потім додає live websocket frames.",
        loadingServices: "Завантажую services для logs...",
        loadingSnapshot: "Завантажую log snapshot...",
        serviceLabel: "Service",
        socketUnavailable:
          "WebSocket недоступний у цьому середовищі, тому показано лише snapshot.",
        streamConnectFallback: "Не вдалося підключити live log stream.",
        streamFrameFallback: "Live log stream повернув нечитабельний frame.",
      },
      shellLabel: "Стан UI",
      shellValue: "Shell ready",
      slugHint:
        "Стабільний runtime slug, який використовують deploy і runtime integrations.",
      slugLabel: "Slug",
      sourceTypeHint:
        "Початковий source mode, вибраний під час create project.",
      sourceTypeLabel: "Тип source",
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
        actionLoading: "Застосовую...",
        actionSuccess: "Service action застосовано.",
        actionUnavailable:
          "У цього runtime service немає stable action id, тому controls вимкнені.",
        empty: "Для цього project не знайдено runtime services.",
        hint: "Actions запускаються проти поточного runtime і після завершення перезавантажують список.",
        imageLabel: "Image",
        loading: "Завантажую services project...",
        noPortsValue: "Немає published ports",
        notStartedValue: "Не запущено",
        portsLabel: "Ports",
        serviceLabel: "Service",
        startedAtLabel: "Запущено о",
      },
      tabs: {
        deployments: "Deployments",
        domains: "Domains",
        env: "Env",
        logs: "Logs",
        services: "Services",
      },
      tabsAriaLabel: "Секції деталей project",
    },
    empty: "Project-ів поки немає. Створи перший із цієї сторінки.",
    errorPrefix: "Помилка projects:",
    errors: {
      createFallback: "Налаштування project не вдалося",
      listFallback: "Не вдалося завантажити projects",
      zipRequired: "Потрібен ZIP archive.",
    },
    eyebrow: "Project catalog",
    listSummary:
      "Переглядай поточні projects і запускай нові ZIP або Git-backed runtime, не виходячи з protected portal.",
    listTitle: "Projects",
    loading: "Завантажую projects...",
    pageSummary:
      "Створюй нові project metadata і підв'язуй перший source в одному guarded admin flow.",
    pageTitle: "Projects workspace",
    openAction: "Відкрити",
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
      action: "Дія",
      entityType: "Сутність",
      message: "Повідомлення",
      project: "Project",
      timestamp: "Час",
    },
    empty: "Audit записів поки немає.",
    emptyValue: "—",
    errorPrefix: "Помилка audit:",
    errors: {
      exportFallback: "Не вдалося експортувати audit log",
      listFallback: "Не вдалося завантажити audit log",
    },
    export: {
      action: "Експорт CSV",
      loading: "Експортую CSV...",
    },
    filteredEmpty: "За поточними фільтрами audit записів не знайдено.",
    drawer: {
      close: "Закрити",
      fields: {
        entityId: "Entity id",
        userId: "User id",
      },
      summary:
        "Переглядай повний вибраний audit record, не залишаючи поточний відфільтрований список.",
      title: "Деталі запису",
    },
    filters: {
      actionAll: "Усі дії",
      actionLabel: "Дія",
      entityTypeAll: "Усі сутності",
      entityTypeLabel: "Тип сутності",
      searchLabel: "Пошук записів",
      searchPlaceholder: "Шукай за дією, сутністю, project або повідомленням",
    },
    eyebrow: "Audit trail",
    listTitle: "Останні записи",
    loading: "Завантажую audit trail...",
    pageSummary:
      "Переглядай останні guarded admin дії, уже збережені backend audit API.",
    pageTitle: "Audit trail",
    pagination: {
      next: "Далі",
      previous: "Назад",
      rangeLabel: "Видимі рядки",
    },
    panelSummary:
      "Ця сторінка лишається read-only і показує найновіші audit entries першими.",
  },
  nav: {
    ariaLabel: "Основна навігація dashboard",
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
    memoryLegend: "Пам'ять",
    summary:
      "Порівнюй найважчі сервіси за compute pressure, не виходячи з overview canvas.",
    title: "Тиск сервісів",
  },
  runtime: {
    awaitingUpdate: "Чекаю першого poll",
    connectionHealthy: "Можна безпечно чекати наступного scheduled refresh.",
    connectionLabel: "Стан сесії",
    connectionPending: "Очікуються credentials",
    connectionReady: "Live session активна",
    demoBadge: "DEMO",
    lastUpdatedLabel: "Останній refresh",
    liveBadge: "LIVE",
    memoryHeadroomLabel: "Запас пам'яті",
    overviewSummary:
      "Головна картка залишає реальний metrics session видимим, але chart area вже говорить мовою нового portal dashboard.",
    overviewTitle: "Огляд runtime",
    peakCpuLabel: "Піковий CPU",
    projectLabel: "Project target",
    projectPlaceholder: "Project не вибрано",
  },
  services: {
    empty:
      "Підключи runtime session, щоб замінити empty state живими рядками сервісів.",
    eyebrow: "Runtime list",
    status: {
      healthy: "Стабільно",
      idle: "Idle",
      watch: "Під наглядом",
    },
    statusColumn: "Статус",
    summary:
      "Нижня таблиця лишається фактологічною: сервіс, CPU, пам'ять, трафік і легкий pressure badge.",
    title: "Сервіси runtime",
    trafficColumn: "Трафік",
  },
  sidebar: {
    environmentConnected: "Runtime підключено",
    environmentLabel: "Environment",
    environmentPending: "Очікується metrics session",
  },
  tools: {
    apiBaseLabel: "API base URL",
    eyebrow: "Workspace tools",
    localeLabel: "Мова інтерфейсу",
    summary:
      "Тримай project target, locale і shared API contract в одній operational card.",
    title: "Панель керування",
  },
  topbar: {
    alertsCalm: "Активних alert немає",
    alertsWarning: "Є warning у метриках",
    commandHint: "Ctrl K",
    searchPlaceholder: "Пошук сервісів, логів або deploy",
    sessionLive: "Runtime live",
    sessionPending: "Сесію не налаштовано",
    userName: "Admin user",
    userRole: "Операції",
  },
} as const;
