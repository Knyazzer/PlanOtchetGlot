Да. И главный вывод исследования здесь довольно жёсткий:

Нельзя получить одну математическую метрику «эффективности сотрудника», которая одновременно объективно измеряет труд, ценность, загрузку и при этом не геймится.
Это разные величины, и попытка свернуть их в один KPI почти неизбежно создаёт стимул оптимизировать число вместо результата.

Ваше наблюдение про эффективность = k — абсолютно правильное. Более того, оно показывает фундаментальную проблему модели: вы измеряете не продуктивность, а количество одновременно открытых работ.

Ниже — как я бы построил систему.

1. Сначала разделить четыре разных вопроса

В системе должны существовать четыре независимые оси:

Вопрос	Метрика	Кто/что измеряется
Сколько работы человеку назначили?	Load / Planned Load	сотрудник
Насколько человек/команда заняты?	Utilization	сотрудник/команда
Насколько предсказуемо выполняется работа?	Delivery / Estimate Accuracy / Flow	задача/команда
Получился ли полезный результат?	Quality / Outcome / Value	продукт/проект

И принципиально:

Load ≠ Utilization ≠ Efficiency ≠ Value.

Например, сотрудник может иметь:

Load = 180%;
Utilization = 85%;
Delivery = excellent;
Quality = excellent.

Это вполне возможно: его перегрузили, но он хорошо выполняет работу.

И наоборот:

Load = 80%;
Utilization = 95%;
Delivery = excellent;
Value = практически нулевая.

Он может идеально выполнять массу ненужных задач.

Именно поэтому крупные системы обычно не пытаются сделать из этого одно число.

2. Ваша модель 1/k математически корректна — но измеряет не то

Ваш инвариант:

i
∑
	​

T
i
	​

=T
worked
	​


при распределении каждого момента между k активными задачами действительно очень полезен.

Он решает проблему:

«Я одновременно запустил 5 таймеров → получил 40 часов работы за 8 часов».

Но затем возникает:

Efficiency=
T
worked
	​

∑EstimatedCompleted
i
	​

	​


и при одинаковых задачах:

Efficiency≈k

То есть модель говорит:

«Чем больше одновременно открыто задач, тем продуктивнее человек».

Это не ошибка реализации. Это логическое следствие выбранной метрики.

Причём в реальной разработке multitasking действительно имеет стоимость: исследования software development находят негативное влияние переключений контекста и особенно voluntary/self-interruptions.

Поэтому я бы вообще не пытался превращать concurrency в положительный множитель.

3. Самое важное изменение: перестать считать concurrency производительностью

Вместо:

Productivity∝k

делайте:

Concurrency→Cost

То есть несколько одновременно начатых задач — не бонус, а состояние workflow, которое потенциально является издержкой.

Например:

WIP=∣{tasks:started∧not finished}∣

и отдельно:

ContextSwitches=число переходов между задачами

и:

ActiveWIP(t)=количество одновременно активных задач

Можно считать:

AverageWIP=
T
1
	​

∫
0
T
	​

ActiveWIP(t)dt

Но не надо превращать это напрямую в штраф зарплате/рейтингу сотрудника.

Это прежде всего диагностическая метрика менеджера:

«Почему у человека постоянно 6 WIP?»

Возможно, проблема не в сотруднике, а в организации работы.

Kanban именно так и трактует WIP: это один из базовых flow metrics вместе с throughput, work-item age и cycle time.

4. А что делать с вашими интервалами?

Я бы сохранил их, но изменил смысл.

Не:

«интервал показывает, сколько времени я реально потратил на задачу».

А:

«интервал показывает распределение доступного рабочего времени между работами».

Например:

09:00–10:00
  Task A = 100%

10:00–10:30
  Meeting = 100%

10:30–11:30
  Task A = 70%
  Task B = 30%

11:30–12:00
  Task B = 100%

Тогда:

i
∑
	​

allocatedTime
i
	​

≤WorkedTime

и никакой магии с 16 часами из 8 не возникает.

Но есть важный нюанс:

Не надо автоматически считать 1/k

Встреча + параллельное редактирование документа — это не обязательно:

50% meeting
50% task

Человек мог:

95% слушать;
сделать 5% работы;
или вообще не делать работу.

Следовательно, математически определить истинное распределение внимания по таймерам невозможно.

Это фундаментальное ограничение измерения.

Поэтому я бы сделал два режима:

A. Focused work

Один активный work item:

allocation=100%
B. Explicit allocation

Если пользователь действительно делает несколько работ:

A = 70%
B = 30%

Причём:

∑allocation
i
	​

=100%

А не 1/k.

Это гораздо честнее.

5. Но ещё лучше: не пытаться измерять фактические часы каждой задачи

Это, на мой взгляд, самое важное архитектурное решение для вашей системы.

У вас есть:

Estimate = 3h
Actual = ?

И вы пытаетесь сделать Actual максимально точным.

Но для knowledge work:

Actual task hours часто не являются наблюдаемой физической величиной.

Человек может:

подумать о задаче на прогулке;
обсудить её в Slack;
вспомнить решение через два часа;
переключиться;
сделать две вещи одновременно;
потратить 20 минут на поиск информации;
10 минут на созвон;
потом за 15 минут написать код.

Попытка получить «истинные 2.37 часа именно этой задачи» создаёт ложную точность.

Поэтому я бы разделил:

Capacity time

Сколько времени человек был доступен:

Capacity=WorkingDays−Leave−Holidays−etc.
Allocated time

Сколько capacity распределено между категориями работы.

Cycle time

Сколько календарного времени задача находилась в работе:

CycleTime=FinishedAt−StartedAt

Именно cycle time — стандартная flow-метрика Kanban.

Estimate

Прогноз до начала работы.

Actual

Не обязательно KPI. Это вспомогательная информация для калибровки будущих прогнозов.

6. Тогда ваша «загрузка» становится очень простой

Вот здесь ваша первоначальная идея хорошая.

Пусть:

E
i
	​

=EstimatedEffort
i
	​


а:

C=AvailableCapacity

Тогда:

Load=
C
∑E
i
committed
	​

	​


Например:

capacity = 8.5h
committed work = 10h

Load = 117.6%

Это означает:

человеку назначено больше работы, чем доступно.

Не означает, что человек плохо работает.

Это KPI планирования, а не человека.

7. Причём я бы разделил Assigned Load и Committed Load

Это очень полезное различие.

Assigned

Все задачи, которые вообще назначены человеку.

Committed

Работа, которую ожидается выполнить в данном периоде.

Например:

Backlog:
A 4h
B 3h
C 5h
D 8h

Capacity = 8.5h

Assigned = 20h = 235%

Committed = 7h = 82%

Человек может иметь огромный backlog, но нормальную фактическую загрузку.

Это особенно важно для вашей системы.

8. А «эффективность» лучше заменить на Estimate Accuracy

Допустим:

Estimate = 5h
Actual allocated = 4h

Можно считать:

EA=
Actual
Estimate
	​


Но не использовать это как KPI сотрудника.

Почему?

Потому что тогда сотруднику выгодно:

estimate = 10h
actual = 5h

И он выглядит гением.

Поэтому нужен второй уровень:

Calibration

Для класса одинаковых задач:

CalibrationRatio=
∑Estimate
∑Actual
	​


Например за последние 100 завершённых задач:

500h
520h
	​

=1.04

Команда в среднем оценивает довольно хорошо.

А если:

Estimate
Actual
	​

=1.8

значит проблема, скорее всего, в системе оценки, а не в сотруднике.

9. Очень важный принцип: оценки должны быть immutable

Чтобы ваша система не геймилась:

До начала:
Estimate = 5h

После старта:

Estimate locked

После завершения:

Estimate = 5h
Actual = 6.2h

Если estimate изменили:

5h → 9h

система должна хранить:

initial_estimate = 5h
revised_estimate = 9h

И отдельно:

EstimateRevision=
Initial
Revised−Initial
	​


Это само по себе полезная метрика качества планирования.

10. EVM — очень близкая к вашей задаче идея

Здесь появляется Earned Value Management.

У EVM есть три разных величины:

Planned Value

Что планировали сделать к этому моменту:

PV
Earned Value

Сколько запланированной работы фактически завершено:

EV
Actual Cost

Сколько реально потрачено:

AC

И затем:

SPI=
PV
EV
	​

CPI=
AC
EV
	​


Это классические EVM-показатели PMI.

11. Но EVM нельзя просто перенести на сотрудника

Это очень важный момент.

EVM хорошо работает, когда есть:

baseline;
заранее определённый scope;
объективно определяемый % completion;
budget;
schedule;
достаточно стабильный проект.

Например строительство.

Но:

«Иван сделал задачу на 70%»

не всегда имеет объективный смысл.

Поэтому для вашей системы EVM я бы использовал на уровне проекта/эпика, а не employee KPI.

Например:

Project budget: 1000 effort points
Planned completed: 600
Actually completed: 520
Actual cost: 550h

Можно оценивать:

SPI = 520 / 600
CPI = 520 / 550

Но только если EV действительно имеет объективную основу.

12. Story Points тоже не являются решением

Story Points полезны именно потому, что они не являются часами.

Они позволяют сказать:

A = 2
B = 3
C = 8

как относительный размер.

Но:

8 story points ≠ 8 часов.

Velocity используется для прогнозирования команды по историческим данным, а не для измерения индивидуальной производительности. Martin Fowler прямо подчёркивает, что velocity — инструмент калибровки прогнозов и не productivity metric, а story points нельзя стандартизировать между командами.

Поэтому:

Хорошо
Team velocity:
last 6 iterations = 34, 31, 36, 29, 35, 33
forecast ≈ 33
Плохо
Ivan = 43 points
Petr = 31 points
Ivan is 39% more productive
13. Velocity прекрасно геймится

Например:

до начала:
Task = 5 points

перед завершением:
Task = 13 points

Velocity выросла.

Но производительность не изменилась.

Поэтому:

Story points/velocity — planning instrument, не HR instrument.

Это один из наиболее важных анти-паттернов.

14. Kanban даёт другой, очень полезный подход

Kanban предлагает смотреть прежде всего на flow.

Минимальный набор:

WIP
Throughput
CycleTime
WorkItemAge

Это официально входит в базовый набор Kanban flow metrics.

И здесь возникает очень полезная связь:

WIP=Throughput×CycleTime

Это Little's Law.

Например:

Throughput = 20 задач / неделю
Average WIP = 10 задач

Тогда:

CycleTime≈
20
10
	​

=0.5 week

То есть примерно 2.5 рабочих дня.

15. Поэтому вместо «кто работает быстрее?» спрашивайте:

Как устроен поток работы?

Например:

Team A
WIP       = 18
Throughput = 20/week
Cycle time = 4.5 days
Team B
WIP       = 8
Throughput = 20/week
Cycle time = 2 days

Обе команды производят одинаковый объём.

Но B имеет намного меньше незавершённой работы и быстрее доставляет результат.

Это намного более полезно руководителю, чем:

«Пётр имеет efficiency 137%.»

16. Flow Efficiency

Есть ещё:

FlowEfficiency=
ElapsedTime
ValueAddedTime
	​


Например:

Task started Monday 09:00
finished Wednesday 17:00

elapsed = 24h

actual active work = 4h

Тогда:

FlowEfficiency=
24
4
	​

=16.7%

Это показывает огромный потенциал ожидания.

Но тут есть сложность:

Что считать Value Added Time?

Если человек думает над архитектурой — это value-added?

Если читает документацию?

Если ждёт code review?

Поэтому flow efficiency хороша для диагностики процесса, но плохо подходит для оценки человека.

Kanban Guide также определяет value-adding/non-value-adding time как отдельную область анализа flow.

17. Как учитывать context switching

Я бы сделал это отдельным измерением, а не частью productivity formula.

Например:

SwitchRate=
FocusedWorkHours
NumberOfContextSwitches
	​


и:

AvgFocusBlock=
NumberOfFocusBlocks
FocusedWorkTime
	​


Дополнительно:

WIP
avg
	​

WIP
p95
	​


Например:

Average WIP       = 2.1
P95 WIP           = 5
Context switches  = 11/day
Average focus     = 38 min

Менеджер получает сигнал:

«Человек постоянно переключается».

Но система не говорит:

«поэтому Иван плохой сотрудник».

Потому что переключения могут быть вызваны:

support;
incident;
manager requests;
dependencies;
meetings;
срочными задачами.

Исследования и практики Team Topologies как раз рассматривают cognitive load и excessive context switching как системную проблему организации работы.

18. И вот здесь появляется очень сильная идея

Разделите:

Employee-controlled

То, что зависит от человека:

quality;
completion;
responsiveness;
соблюдение договорённостей.
System-caused

То, что возникает из организации:

waiting;
blocked;
priority changes;
interrupts;
excessive WIP;
dependencies;
meetings.

Например:

Task cycle time = 5 days

Active work = 4h
Waiting for review = 2 days
Waiting for client = 1 day
Blocked = 1 day

Наивная система скажет:

«Сотрудник делал задачу 5 дней».

Хорошая система скажет:

Active work:      4h
Waiting review:   2d
Waiting client:  1d
Blocked:          1d

Это радикально более справедливо.

19. Что делать с «ценностью»?

Здесь тоже не стоит пытаться придумать:

Task value = 73 points

и затем:

Value/Hours

Потому что вы просто создадите новый объект для игры.

Вместо этого value должна приходить с уровня результата.

Например:

Feature
 ├── Tasks
 ├── Tasks
 └── Tasks

Outcome:
conversion +3.2%

или:

Support improvement
→ median resolution time -18%

или:

Automation
→ saves ~40 employee-hours/month

То есть:

OutcomeMetric

не вычисляется из количества задач.

Он измеряется отдельно.

Agile Manifesto формулирует похожий принцип: работающий продукт является основной мерой прогресса, а не объём внутренней активности.

20. Поэтому я бы не делал «Value Points»

Лучше:

Task
   ↓
Deliverable
   ↓
Outcome
   ↓
Business metric

Например:

Task:
"Implement caching"

Deliverable:
"API response cache"

Outcome:
"P95 latency -40%"

Business:
"Checkout abandonment -2%"

Чем ближе вы к правой стороне, тем меньше смысла приписывать заслугу одному сотруднику.

21. Что реально делают PSA-системы

В Professional Services Automation используется совсем другая логика.

Например, resource/billable utilization:

Utilization=
AvailableHours
BillableHours
	​


Это стандартный KPI профессиональных сервисов. Kantata и Deltek описывают именно такую модель.

Причём available hours должны учитывать отпуск, праздники и прочее, а не просто:

40×52

Kantata прямо подчёркивает эту разницу.

Но обратите внимание:

billable utilization не означает employee productivity.

Она отвечает:

«Какая доля доступного времени была потрачена на оплачиваемую клиентскую работу?»

Это бизнес-метрика capacity/revenue.

22. Почему консалтинг может иметь 80% utilization, а software team — нет

В консалтинге:

8h available
6.4h client work

может быть вполне разумно:

Utilization=80%

Но software engineer должен ещё:

учиться;
заниматься архитектурой;
делать code review;
помогать коллегам;
устранять технический долг;
участвовать в planning;
исследовать технологии.

Поэтому:

Нельзя импортировать PSA utilization benchmark как KPI разработчика.

Например, Deltek публикует benchmark около 66.4% среднего billable utilization в 2025 и более 80% для наиболее зрелых PS organizations. Это полезно для PSA/resource planning, но не является универсальным нормативом для software employees.

23. DORA/SPACE дают ещё один важный урок

Для software organizations очень показательно развитие DORA и SPACE.

DORA использует:

deployment frequency;
lead time;
change failure rate;
time to restore.

Но DORA специально предупреждает:

не превращать метрики в цель и не пытаться сделать одну метрику главной.

Это прямой риск Goodhart's Law.

SPACE ещё шире и предлагает смотреть на productivity через несколько измерений, а не через output одного человека.

И это очень хорошо соответствует вашей проблеме.

24. Что конкретно я бы сделал в вашей системе

Я бы вообще убрал слово «эффективность сотрудника».

И сделал такой dashboard.

A. Capacity
Available Capacity
C=WorkingHours−Leave−Holidays

Например:

8.5h/day
B. Planning Load
Committed Load
Load=
Capacity
∑EstimatedEffort
committed
	​

	​


Например:

82%
117%
143%

Интерпретация:

<80%     запас
80–100%  нормальная загрузка
>100%    потенциальный overload

Границы здесь не универсальный стандарт, а ваша политика.

25. C. Utilization

Не «эффективность», а:

Utilization=
AvailableCapacity
AllocatedProductiveTime
	​


Но только если вы действительно умеете нормально собирать time allocation.

Например:

Capacity      8.5h
productive    6.7h
meetings      1.0h
admin         0.8h

Тогда:

Utilization=78.8%

Но:

100% utilization не является целью.

Потому что 100% загрузка без buffer превращает систему в queueing system с плохими tail latencies.

26. D. Flow

На уровне команды:

Throughput
Throughput=
Time
CompletedItems
	​

Cycle Time
CycleTime=Finished−Started
WIP
WIP=ActiveItems
Work Item Age
Age=Now−Started

Это именно тот минимальный набор, который рекомендует Kanban Guide.

27. E. Predictability

Вот это я бы назвал Execution Quality.

Например:

EstimateRatio=
InitialEstimate
Actual
	​


Но смотреть не на одного человека, а на distribution.

Например:

p50 = 0.95
p75 = 1.25
p90 = 1.90

Это намного информативнее:

«90% задач укладываются примерно в 1.9× первоначальной оценки».

Ещё лучше:

ForecastError=
Estimate
∣Actual−Estimate∣
	​


И смотреть медиану/p75/p90.

28. F. Quality

Отдельно:

Reopen rate
Rework rate
Defect rate
Escaped defects
Review rejection
Incident rate

Например:

ReworkRate=
TotalWorkHours
ReworkHours
	​


или:

DefectRate=
CompletedItems
Defects
	​


Но опять же — лучше командный/продуктовый уровень, если дефект нельзя честно атрибутировать одному человеку.

29. G. Outcome

Если возможно:

Revenue
Conversion
Latency
Retention
Cost reduction
Tickets avoided
Incidents reduced
Customer satisfaction

Это наиболее близко к настоящей ценности.

30. А что показывать руководителю по сотруднику?

Я бы сделал примерно так:

Ivan Petrov
────────────────────────────────

CAPACITY
Available                  160h

PLANNING
Committed                  132h
Load                        82%

FLOW
Average WIP                 1.8
P95 WIP                     4
Context switches/day        5.2

DELIVERY
Completed                   37
Cycle time P50              1.8d
Cycle time P85              4.2d

PREDICTABILITY
Estimate/actual P50         1.08
Estimate/actual P85         1.64

QUALITY
Rework                      3.1%
Defects                     0.8%

BLOCKERS
Blocked time               11.4h
Waiting for others          8.1h

OUTCOMES
Features delivered          7
Linked outcomes             3

И никакого

Ivan = 127% efficiency
31. Как сделать систему устойчивой к геймингу

Здесь есть несколько очень сильных правил.

Rule 1 — дробление задач не должно увеличивать score

Если:

A = 10h

превратили в:

A1 = 2h
A2 = 2h
A3 = 2h
A4 = 2h
A5 = 2h

то:

TotalEstimate(A)=∑Estimate(A
i
	​

)

А flow metrics должны агрегироваться до parent item там, где дробление является чисто техническим.

32. Rule 2 — оценка фиксируется до начала
initial_estimate

immutable.

Любая последующая оценка:

reestimate

идёт отдельно.

Это убирает:

«Давайте увеличим estimate после того, как поняли, что задача сложная».

33. Rule 3 — completed item должен иметь Definition of Done

Иначе:

Task = 100% complete

можно объявить почти в любой момент.

Нужен объективный finish event:

merged
deployed
accepted
approved
released

в зависимости от типа работы.

34. Rule 4 — не награждать за WIP

Это критически важно.

Не:

Performance∝WIP

а:

WIP→diagnostic

Если человек держит:

7 задач active

это скорее повод спросить:

«Почему у него семь задач?»

чем:

«Какой молодец, высокая многозадачность».

35. Rule 5 — не использовать task count

Вы уже обнаружили проблему:

Tasks/Hour

сломано дроблением.

Я бы вообще не показывал это как performance metric.

Количество задач полезно как operational statistic, но не как KPI.

36. Rule 6 — не использовать hours completed как productivity

Тоже геймится:

Task estimate = 100h

и сотрудник получает больше «output».

Hours — это cost/effort, а не value.

37. Rule 7 — не использовать story points как employee KPI

Потому что:

Points↑

можно получить простым изменением estimation scale.

Velocity должна быть:

team forecasting instrument

а не:

employee score

Это прямо соответствует established agile practice.

38. Rule 8 — использовать distributions, а не средние

Это очень важно.

Вместо:

Average cycle time = 3.4d

лучше:

P50 = 1.8d
P75 = 3.2d
P85 = 4.5d
P95 = 8.7d

Потому что knowledge work имеет heavy tails.

Среднее часто скрывает реальные проблемы.

39. Rule 9 — сравнивать человека только с его собственным baseline

Не:

Ivan: 42 points
Petr: 31 points

Ivan +35%

А:

Ivan
last quarter:
P50 cycle = 2.8d

this quarter:
P50 cycle = 2.1d

Это гораздо безопаснее.

Ещё лучше — сравнивать команды одного типа работы, а не разных специалистов.

40. Rule 10 — метрики должны иметь взаимные противовесы

Это один из лучших способов против Goodhart.

Например нельзя оптимизировать:

Throughput ↑

без:

Quality
Cycle time
Rework

Потому что иначе появится:

1000 tiny tasks

Нельзя оптимизировать:

Utilization ↑

без:

WIP
Cycle time
Overtime

Иначе получаете:

100% utilization
→ queue explodes
→ deadlines worsen

Нельзя оптимизировать:

Estimate accuracy

без:

Scope changes
Quality
Outcome

Иначе сотрудники начнут делать оценки максимально безопасными.

DORA отдельно предупреждает именно о проблеме превращения метрик в цели и рекомендует несколько метрик с «healthy tension».

41. Что я бы считал «эффективностью», если очень нужен один показатель?

Если бизнес абсолютно требует одно число, я бы сделал его не «эффективностью сотрудника», а:

Delivery Health Score

И только для команды/потока, не для HR.

Например:

Health=f(Predictability,CycleTime,Quality,WIP,Outcome)

Но не складывать их тупо:

0.2A+0.2B+...

потому что веса тоже станут объектом оптимизации.

Лучше использовать gates.

Например:

Delivery Health = GREEN

если:
P85 cycle time < SLE
AND
rework < threshold
AND
quality > threshold
AND
WIP stable

То есть система не позволяет одному показателю компенсировать провал другого.

42. Очень полезная архитектура: «метрики → не score, а причинная цепочка»

Я бы проектировал модель так:

                    BUSINESS OUTCOME
                           ↑
                     VALUE / IMPACT
                           ↑
                       DELIVERY
                           ↑
              ┌────────────┼────────────┐
              │            │            │
          Throughput    Cycle Time   Quality
              ↑            ↑
             WIP       Blocked Time
              ↑
          Capacity
              ↑
          Assignment

А employee time находится примерно здесь:

Capacity
   ↓
Allocation
   ↓
Work

Но не является доказательством value.

43. Что получается с вашими тремя кейсами

Ваши:

A
6 × 2.5h
sequential
15h work
15h actual
B
6 × 2.5h
parallel
15h estimated
7.5h actual
C
12 × 2.8h
parallel
33.6h estimated
11.2h actual

Старая система:

A = 100%
B = 200%
C = 300%

Новая:

Planning Load
A = 176%
B = 176%
C = 395%

если denominator = 8.5h.

И все три выглядят как planning problem, а C — особенно.

44. Delivery

Если estimate является baseline:

A: completed 15h budget / 15h capacity
B: completed 15h budget / 7.5h allocated capacity
C: completed 33.6h budget / 11.2h allocated capacity

Но здесь возникает красный флаг:

B и C дают невероятно хороший результат.

Это означает не:

«человек в 2–3 раза эффективнее».

А:

«Наш estimate не является хорошей proxy для реального effort в условиях parallel execution».

То есть именно ваша модель выявляет проблему данных.

45. И я бы добавил специальный metric: Estimate Calibration

Например:

Estimate = 15h
Allocated time = 7.5h

ratio = 0.50

Если такое повторяется постоянно:

median ratio = 0.52

то система постепенно понимает:

«Для этого класса работ estimates примерно в 2 раза выше observed allocated effort».

Но не надо автоматически исправлять estimates сотруднику.

Используйте aggregate calibration:

Calibration=median(
InitialEstimate
Actual
	​

)

по:

team
work type
project type
complexity class
46. Ещё лучше — использовать historical forecasting

После накопления истории можно вообще отказаться от требования:

«Эта задача должна быть оценена в 7.3 часа».

Вместо этого:

Task class = Medium
Historical cycle:
P50 = 2.1d
P85 = 4.7d

И прогноз:

«Есть 85% вероятность закончить Medium item за 4.7 рабочих дня».

Это гораздо ближе к тому, как flow-based systems реально прогнозируют.

Kanban Guide, например, определяет Service Level Expectation именно как прогноз вероятности завершения за определённый elapsed time, основанный на историческом cycle time.

47. Моя рекомендуемая минимальная модель данных

Я бы хранил:

Task
------
initial_estimate
current_estimate
estimate_history

started_at
finished_at

priority
type
parent
project

blocked_intervals[]
status_intervals[]

allocation_intervals[]

И для сотрудника:

Capacity
--------
available_hours
leave_hours
holiday_hours

Allocation
----------
task_hours
meeting_hours
admin_hours
support_hours

И агрегаты:

Load
Utilization
WIP
Throughput
Cycle Time
Work Item Age
Estimate Calibration
Rework
Quality
Blocked Time
Context Switches
48. А вот чего я бы НЕ хранил как KPI

Не делать:

tasks_per_hour
hours_completed_per_hour
story_points_per_employee
concurrency_bonus
lines_of_code
commits_per_day
tickets_per_day

И даже:

estimate / actual

не использовать напрямую для employee ranking.

SPACE прямо рекомендует избегать простых индивидуальных output metrics вроде lines of code и commit counts и смотреть на productivity как на многомерную конструкцию.

49. Итоговая система, которую я рекомендую

Если сделать совсем коротко, я бы оставил 7 основных метрик.

1. Load
Load=
AvailableCapacity
CommittedEstimate
	​

	​


Отвечает: не перегрузили ли человека?

2. Utilization
Utilization=
AvailableCapacity
AllocatedProductiveTime
	​

	​


Отвечает: куда ушло доступное время?

Не использовать как «чем выше, тем лучше».

3. WIP
WIP=ActiveWorkItems
	​


Отвечает: сколько работы одновременно тащится?

4. Throughput
Throughput=
Time
CompletedItems
	​

	​


Отвечает: с какой скоростью система доставляет результаты?

5. Cycle Time
CycleTime=Finished−Started
	​


Отвечает: сколько клиент ждёт результат?

6. Quality

Например:

ReworkRate=
TotalWork
Rework
	​

	​


Отвечает: не покупаем ли скорость качеством?

7. Outcome
Outcome=ActualBusinessResult
	​


Отвечает: зачем вообще выполнялась работа?

50. А time tracking я бы использовал не для «доказательства эффективности»

А для трёх вещей:

1. Capacity planning
2. Cost accounting
3. Process diagnosis

То есть:

«На что уходит capacity?»

а не:

«Действительно ли Иван работал 7 часов 43 минуты?»

Это принципиальная разница.

51. И самый главный вывод

Ваш эксперимент с 1/k фактически обнаружил очень важную вещь:

Время — это ресурс, а concurrency — свойство процесса. Ни одно из них само по себе не является производительностью.

Поэтому я бы не пытался чинить формулу:

Efficiency=
ActualTime
EstimatedWork
	​


коэффициентом вида:

f(k)

Потому что тогда начнётся бесконечная гонка:

k
↓
f(k)
↓
context switching
↓
quality penalty
↓
task size
↓
estimate inflation
↓
...

Вы будете строить всё более сложную формулу для измерения величины, которая не наблюдается напрямую.

Гораздо устойчивее архитектура:

                  ┌──────────────┐
                  │   CAPACITY   │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │     LOAD     │ ← planning
                  └──────────────┘

                  ┌──────────────┐
                  │     WIP      │
                  │  throughput  │
                  │ cycle time   │ ← flow
                  └──────────────┘

                  ┌──────────────┐
                  │    QUALITY   │ ← execution
                  └──────────────┘

                  ┌──────────────┐
                  │   OUTCOME    │ ← value
                  └──────────────┘

И не сворачивать эти четыре блока в один employee score.

Это наиболее близко к established practice: PSA использует utilization для capacity/revenue, EVM — PV/EV/AC для проектного baseline, Kanban — WIP/throughput/cycle time для flow, Agile velocity — для командного forecasting, а DORA/SPACE — многомерный взгляд на delivery/productivity и явное предостережение против превращения отдельных метрик в цели.

Если проектировать именно вашу систему, я бы выбрал такой принцип:
Load — персональный; Utilization — операционный; Flow/Quality — командные; Outcome — продуктовый.
А time intervals оставил бы как механизм распределения capacity, но убрал бы из них саму попытку вывести «истинные часы работы задачи».

Это, на мой взгляд, даст значительно более честную систему и одновременно сделает её существенно труднее геймить.