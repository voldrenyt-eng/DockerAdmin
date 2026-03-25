export const app = {
  auth: {
    apiHint:
      "Эта же API base адреса обслуживает login, refresh, logout и guarded runtime calls.",
    emailLabel: "Email",
    emailPlaceholder: "admin@example.com",
    errorFallback: "Login не удался",
    eyebrow: "Admin sign-in",
    hint: "Используй seeded admin credentials, чтобы войти в существующий runtime dashboard.",
    logout: "Выйти",
    panelBadge: "JWT + Refresh",
    panelEyebrow: "Доступ",
    panelSummary:
      "Начни с реальной admin session, а потом управляй метриками и runtime-действиями через guarded API.",
    panelTitle: "Войди, чтобы продолжить",
    passwordLabel: "Пароль",
    passwordPlaceholder: "Введи admin password",
    sessionExpired: "Сессия завершена. Войди снова.",
    sessionHint:
      "Этот браузер локально держит текущую admin session для MVP flow.",
    sessionLabel: "Вошел как",
    storageHint:
      "Access и refresh token остаются только в localStorage этого браузера для MVP shell.",
    storageLabel: "Модель сессии",
    storageValue: "Локальная сессия",
    submitIdle: "Войти",
    submitLoading: "Выполняю вход...",
    summary:
      "Сначала аутентифицируйся, а потом продолжай в том же portal dashboard без ручной вставки bearer token.",
    title: "Admin login",
  },
  error: {
    summaryPrefix:
      "Web по-прежнему читает стандартизированные ошибки API через shared DTO пакет даже внутри нового dashboard shell.",
    title: "Общий контракт ошибок API",
  },
  hero: {
    breadcrumbCurrent: "Dashboard",
    breadcrumbLabel: "Обзор",
    eyebrow: "Admin workspace",
    summary:
      "Держи один project runtime под наблюдением, смотри на давление сервисов и не теряй live metrics session внутри нового shell.",
    title: "Центр контроля runtime",
  },
  kpis: {
    cpu: {
      detail: "средняя нагрузка runtime",
      label: "Средний CPU",
    },
    memory: {
      detail: "текущий working set",
      label: "Использование памяти",
    },
    services: {
      detail: "сервисы, видимые в runtime",
      label: "Активные сервисы",
    },
    traffic: {
      detail: "суммарный network flow",
      label: "Сетевой трафик",
    },
  },
  metrics: {
    accessTokenHint:
      "Вставь текущий admin bearer token. Значение хранится только в localStorage этого браузера для локального MVP тестирования.",
    accessTokenLabel: "Access token",
    accessTokenPlaceholder: "Вставь admin bearer token",
    columns: {
      cpu: "CPU %",
      memoryLimit: "Лимит памяти",
      memoryUsage: "Использование памяти",
      networkRx: "Network RX",
      networkTx: "Network TX",
      service: "Сервис",
    },
    description:
      "Опрашивай guarded metrics endpoint примерно каждые 5 секунд для одного project runtime.",
    emptyConfig: "Заполни project id, чтобы запустить live polling.",
    emptyData: "Для этого project runtime метрики пока не вернулись.",
    errorPrefix: "Ошибка метрик:",
    intervalHint:
      "Polling автоматически останавливается при unmount страницы или закрытии вкладки.",
    lastUpdatedPrefix: "Последнее обновление:",
    loading: "Загрузка метрик...",
    projectIdHint: "Используй backend project id, а не project slug.",
    projectIdLabel: "Project id",
    projectIdPlaceholder: "project_1",
    refreshing: "Обновляю метрики...",
    title: "Live metrics",
  },
  projects: {
    breadcrumbCurrent: "Projects",
    breadcrumbLabel: "Workspace",
    columns: {
      actions: "Действие",
      name: "Название",
      slug: "Slug",
      sourceType: "Тип source",
    },
    create: {
      action: "Create Project",
      cancel: "Отмена",
      close: "Закрыть",
      closedHint:
        "Открой эту панель, чтобы создать project и подключить его первый source.",
      completed: "Project создан, и source подключен.",
      continueIdle: "Продолжить",
      continueLoading: "Создаю project...",
      eyebrow: "Project intake",
      gitBranchLabel: "Branch (optional)",
      gitBranchPlaceholder: "main",
      gitSubmitIdle: "Клонировать repository",
      gitSubmitLoading: "Клонирую repository...",
      gitUrlLabel: "Git URL",
      gitUrlPlaceholder: "https://github.com/example/repo.git",
      metadataCreated: "Project metadata созданы. Продолжай настройку source.",
      metadataHint:
        "Сначала задай имя и source type, а потом переходи к ZIP или Git setup.",
      nameLabel: "Название project",
      namePlaceholder: "Storefront runtime",
      pendingLabel: "Pending project",
      sourceHint:
        "Заверши source step, чтобы этот project flow считался завершенным в UI.",
      sourceTypeLabel: "Source type",
      summary:
        "Сначала создай project metadata, а потом в той же панели подключи ZIP или Git source.",
      title: "Create Project",
      zipHint: "Выбери стартовый ZIP archive для этого project.",
      zipLabel: "ZIP archive",
      zipSubmitIdle: "Загрузить ZIP",
      zipSubmitLoading: "Загружаю ZIP...",
    },
    detail: {
      activeTabLabel: "Активная секция",
      backAction: "Назад к projects",
      content: {
        deployments: {
          description:
            "Этот route теперь показывает последний статус deploy, manual deploy action и компактную recent history.",
          endpointHint:
            "Панель читает newest-first history деплоев и использует guarded deploy trigger endpoint.",
          nextStep:
            "Следующий batch сможет добавить polling или drilldown в deploy logs без изменения route.",
          summary:
            "Деплой текущего project и просмотр последней history деплоев.",
        },
        domains: {
          description:
            "Этот route теперь показывает текущие domain bindings и create/delete workflow для выбранного project.",
          endpointHint:
            "Панель фильтрует guarded domain data до текущего project и использует existing create/delete endpoints.",
          nextStep:
            "Следующий batch сможет добавить edit flow или более сильные DNS hints без изменения route.",
          summary:
            "Управляй domain bindings текущего project и создавай новые guarded host routes.",
        },
        env: {
          description:
            "Этот route резервирует финальное место для guarded env read/write flow.",
          endpointHint:
            "Backend уже поддерживает project env read, а edit UI идет следующим batch-ем.",
          nextStep:
            "E10-5 сможет подключить env editor в этот route без изменения навигации.",
          summary: "Env shell для encrypted project environment editing.",
        },
        logs: {
          description:
            "Этот route теперь объединяет выбор service, один guarded HTTP snapshot и live websocket append.",
          endpointHint:
            "Панель использует existing HTTP logs snapshot и authenticated websocket stream для follow mode.",
          nextStep:
            "Следующий batch сможет добавить более богатые фильтры или multi-service view без изменения route.",
          summary:
            "Просматривай log stream одного service через guarded snapshot и live websocket updates.",
        },
        services: {
          description:
            "Этот route теперь показывает live service inventory project и row-level runtime actions.",
          endpointHint:
            "Панель читает guarded runtime services и использует existing action endpoint для start, stop и restart.",
          nextStep:
            "Следующий batch сможет добавить более богатую runtime diagnostics без изменения route.",
          summary:
            "Просматривай live runtime services и запускай guarded service actions с этого route.",
        },
      },
      domainActions: {
        delete: "Удалить",
      },
      domainsPanel: {
        createSuccess: "Domain binding создан.",
        deleteAction: "Удалить",
        deleteLoading: "Удаляю...",
        deleteSuccess: "Domain binding удален.",
        domainLabel: "Domain",
        empty: "Для этого project еще нет domain bindings.",
        hint: "Создавай bindings только для текущих runtime services.",
        hostLabel: "Host",
        hostPlaceholder: "demo.example.com",
        loading: "Загружаю domains project...",
        noServicesHint: "Перед create domain binding нужны runtime services.",
        portLabel: "Port",
        portPlaceholder: "8080",
        serviceLabel: "Целевой service",
        submitIdle: "Создать domain",
        submitLoading: "Создаю domain...",
        tlsDisabled: "TLS off",
        tlsEnabled: "TLS on",
        tlsLabel: "Включить TLS",
      },
      endpointLabel: "Основной endpoint",
      deploymentStatuses: {
        FAILED: "Failed",
        RUNNING: "Running",
        SUCCESS: "Success",
      },
      deploymentsPanel: {
        deployIdle: "Deploy",
        deployLoading: "Деплою...",
        emptyHistory:
          "Деплоев еще не было. Запусти первый deploy с этой вкладки.",
        emptyLatest: "Еще нет ни одного recorded deploy.",
        failedNotice: "Deploy завершился со статусом failed.",
        finishedAtLabel: "Завершено в",
        hint: "Manual deploy идет через текущий backend pipeline и перезагружает history после завершения.",
        historyLabel: "Последняя history",
        historyTitle: "Самые новые записи deploy",
        latestLabel: "Последний deploy",
        loading: "Загружаю history деплоев...",
        notFinishedValue: "Еще выполняется",
        runningNotice:
          "Последний deploy еще выполняется, поэтому повторный manual trigger заблокирован.",
        sourceLabel: "Source",
        startedAtLabel: "Стартовал в",
        statusEmpty: "Без history",
        successNotice: "Deploy завершился успешно.",
        triggerLabel: "Trigger",
      },
      deploymentTriggers: {
        manual: "Manual",
        system: "System",
      },
      envEditor: {
        emptyNotice:
          "Env file еще не задан. Начни с KEY=VALUE строк и сохрани.",
        hint: "Содержимое хранится как raw .env text и шифруется at rest.",
        inputLabel: "Содержимое environment",
        inputPlaceholder: "# APP_ENV=production\n# API_URL=https://example.com",
        loading: "Загружаю project env...",
        reloadAction: "Перезагрузить",
        saveIdle: "Сохранить env",
        saveLoading: "Сохраняю env...",
        saveSuccess: "Project env сохранен.",
        statusPill: "Encrypted",
      },
      errorPrefix: "Ошибка project:",
      errors: {
        createDomainFallback: "Не удалось создать domain",
        deployFallback: "Не удалось запустить deploy",
        deleteDomainFallback: "Не удалось удалить domain",
        loadFallback: "Не удалось загрузить project",
        loadDeploymentsFallback: "Не удалось загрузить history деплоев",
        loadDomainsFallback: "Не удалось загрузить domains project",
        loadEnvFallback: "Не удалось загрузить project env",
        loadLogsFallback: "Не удалось загрузить project logs",
        loadServicesFallback: "Не удалось загрузить project services",
        saveEnvFallback: "Не удалось сохранить project env",
        serviceActionFallback: "Не удалось обновить состояние service",
      },
      headerEyebrow: "Project shell",
      headerSummary:
        "Идентичность project остается видимой здесь, пока runtime, logs, domains, deployments и env workflow переходят на отдельные route.",
      idHint:
        "Используй этот backend project id для guarded runtime endpoint-ов.",
      idLabel: "Project id",
      loadingBody: "Загружаю metadata project для этого route...",
      loadingTitle: "Загружаю project...",
      pageSummary:
        "У каждой вкладки уже есть собственный stable URL, поэтому следующие batch-и смогут добавлять interactive features без изменения навигации.",
      pageTitle: "Project detail",
      panelEyebrow: "Route shell",
      panelTitle: "Project detail",
      logsPanel: {
        connectionStates: {
          connecting: "Connecting",
          idle: "Idle",
          live: "Live",
        },
        emptyLogs: "Для выбранного service еще нет log lines.",
        emptyServices: "Пока нет services для log streaming.",
        hint: "Вкладка сначала загружает один HTTP snapshot, а потом добавляет live websocket frames.",
        loadingServices: "Загружаю services для logs...",
        loadingSnapshot: "Загружаю log snapshot...",
        serviceLabel: "Service",
        socketUnavailable:
          "WebSocket недоступен в этом окружении, поэтому показан только snapshot.",
        streamConnectFallback: "Не удалось подключить live log stream.",
        streamFrameFallback: "Live log stream вернул нечитаемый frame.",
      },
      shellLabel: "Состояние UI",
      shellValue: "Shell ready",
      slugHint:
        "Стабильный runtime slug, который используют deploy и runtime integrations.",
      slugLabel: "Slug",
      sourceTypeHint:
        "Начальный source mode, выбранный во время create project.",
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
        actionLoading: "Применяю...",
        actionSuccess: "Service action применен.",
        actionUnavailable:
          "У этого runtime service нет stable action id, поэтому controls отключены.",
        empty: "Для этого project не найдено runtime services.",
        hint: "Actions запускаются против текущего runtime и после завершения перезагружают список.",
        imageLabel: "Image",
        loading: "Загружаю services project...",
        noPortsValue: "Нет published ports",
        notStartedValue: "Не запущено",
        portsLabel: "Ports",
        serviceLabel: "Service",
        startedAtLabel: "Запущено в",
      },
      tabs: {
        deployments: "Deployments",
        domains: "Domains",
        env: "Env",
        logs: "Logs",
        services: "Services",
      },
      tabsAriaLabel: "Секции деталей project",
    },
    empty: "Project-ов пока нет. Создай первый на этой странице.",
    errorPrefix: "Ошибка projects:",
    errors: {
      createFallback: "Не удалось настроить project",
      listFallback: "Не удалось загрузить projects",
      zipRequired: "Нужен ZIP archive.",
    },
    eyebrow: "Project catalog",
    listSummary:
      "Просматривай текущие projects и запускай новые ZIP или Git-backed runtime, не выходя из protected portal.",
    listTitle: "Projects",
    loading: "Загружаю projects...",
    pageSummary:
      "Создавай новые project metadata и подключай первый source в одном guarded admin flow.",
    pageTitle: "Projects workspace",
    openAction: "Открыть",
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
      action: "Действие",
      entityType: "Сущность",
      message: "Сообщение",
      project: "Project",
      timestamp: "Время",
    },
    empty: "Audit записей пока нет.",
    emptyValue: "—",
    errorPrefix: "Ошибка audit:",
    errors: {
      exportFallback: "Не удалось экспортировать audit log",
      listFallback: "Не удалось загрузить audit log",
    },
    export: {
      action: "Экспорт CSV",
      loading: "Экспортирую CSV...",
    },
    filteredEmpty: "По текущим фильтрам audit записей не найдено.",
    drawer: {
      close: "Закрыть",
      fields: {
        entityId: "Entity id",
        userId: "User id",
      },
      summary:
        "Просматривай полный выбранный audit record, не покидая текущий отфильтрованный список.",
      title: "Детали записи",
    },
    filters: {
      actionAll: "Все действия",
      actionLabel: "Действие",
      entityTypeAll: "Все сущности",
      entityTypeLabel: "Тип сущности",
      searchLabel: "Поиск записей",
      searchPlaceholder: "Ищи по действию, сущности, project или сообщению",
    },
    eyebrow: "Audit trail",
    listTitle: "Последние записи",
    loading: "Загружаю audit trail...",
    pageSummary:
      "Просматривай последние guarded admin-действия, уже сохраненные backend audit API.",
    pageTitle: "Audit trail",
    pagination: {
      next: "Далее",
      previous: "Назад",
      rangeLabel: "Видимые строки",
    },
    panelSummary:
      "Эта страница остается read-only и показывает самые новые audit entries первыми.",
  },
  nav: {
    ariaLabel: "Основная навигация dashboard",
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
    memoryLegend: "Память",
    summary:
      "Сравнивай самые тяжелые сервисы по compute pressure, не выходя из overview canvas.",
    title: "Давление сервисов",
  },
  runtime: {
    awaitingUpdate: "Ожидаю первый poll",
    connectionHealthy: "Можно спокойно ждать следующий scheduled refresh.",
    connectionLabel: "Состояние сессии",
    connectionPending: "Ожидаются credentials",
    connectionReady: "Live session активна",
    demoBadge: "DEMO",
    lastUpdatedLabel: "Последний refresh",
    liveBadge: "LIVE",
    memoryHeadroomLabel: "Запас памяти",
    overviewSummary:
      "Главная карточка оставляет реальный metrics session на виду, но chart area уже говорит на языке нового portal dashboard.",
    overviewTitle: "Обзор runtime",
    peakCpuLabel: "Пиковый CPU",
    projectLabel: "Project target",
    projectPlaceholder: "Project не выбран",
  },
  services: {
    empty:
      "Подключи runtime session, чтобы заменить empty state живыми строками сервисов.",
    eyebrow: "Runtime list",
    status: {
      healthy: "Стабильно",
      idle: "Idle",
      watch: "Под наблюдением",
    },
    statusColumn: "Статус",
    summary:
      "Нижняя таблица остается фактической: сервис, CPU, память, трафик и легкий pressure badge.",
    title: "Сервисы runtime",
    trafficColumn: "Трафик",
  },
  sidebar: {
    environmentConnected: "Runtime подключен",
    environmentLabel: "Environment",
    environmentPending: "Ожидается metrics session",
  },
  tools: {
    apiBaseLabel: "API base URL",
    eyebrow: "Workspace tools",
    localeLabel: "Язык интерфейса",
    summary:
      "Держи project target, locale и shared API contract в одной operational card.",
    title: "Панель управления",
  },
  topbar: {
    alertsCalm: "Активных alert нет",
    alertsWarning: "Есть warning по метрикам",
    commandHint: "Ctrl K",
    searchPlaceholder: "Поиск сервисов, логов или deploy",
    sessionLive: "Runtime live",
    sessionPending: "Сессия не настроена",
    userName: "Admin user",
    userRole: "Операции",
  },
} as const;
