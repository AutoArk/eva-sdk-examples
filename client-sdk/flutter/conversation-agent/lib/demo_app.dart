import 'dart:async';

import 'package:autoark_eva_client_sdk/autoark_eva_client_sdk.dart';
import 'package:flutter/material.dart';

import 'demo_controller.dart';
import 'sdk_usage.dart';

final class EvaDemoApp extends StatefulWidget {
  const EvaDemoApp({super.key, required this.configuration, this.controller});

  final DemoConfiguration configuration;
  final DemoController? controller;

  @override
  State<EvaDemoApp> createState() => _EvaDemoAppState();
}

final class _EvaDemoAppState extends State<EvaDemoApp>
    with WidgetsBindingObserver {
  late final DemoController _controller =
      widget.controller ?? DemoController(configuration: widget.configuration);
  bool _mediaSuspendedByLifecycle = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _mediaSuspendedByLifecycle = true;
      return;
    }
    if (state == AppLifecycleState.resumed && _mediaSuspendedByLifecycle) {
      _mediaSuspendedByLifecycle = false;
      unawaited(_controller.resumeMediaAfterForeground());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller.close());
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'EVA Flutter Demo',
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF176B5B),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFF4F6F5),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
      cardTheme: const CardThemeData(margin: EdgeInsets.zero),
    ),
    home: _DemoWorkspace(controller: _controller),
  );
}

final class _DemoWorkspace extends StatefulWidget {
  const _DemoWorkspace({required this.controller});

  final DemoController controller;

  @override
  State<_DemoWorkspace> createState() => _DemoWorkspaceState();
}

final class _DemoWorkspaceState extends State<_DemoWorkspace> {
  final TextEditingController _composer = TextEditingController();
  final TextEditingController _apiKey = TextEditingController();
  bool _showEvents = false;
  bool _showDiagnostics = false;
  bool _keyboardExpanded = false;

  @override
  void dispose() {
    _apiKey.dispose();
    _composer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (BuildContext context, _) {
      final DemoController controller = widget.controller;
      return Scaffold(
        backgroundColor: const Color(0xFFF0F4F2),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final double panelHeight = constraints.maxHeight > 32
                  ? constraints.maxHeight - 32
                  : constraints.maxHeight;
              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 760),
                    child: MediaQuery.withNoTextScaling(
                      child: SizedBox(
                        height: panelHeight,
                        width: double.infinity,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FBF9),
                            border: Border.all(color: const Color(0xFFC9D6D1)),
                            borderRadius: BorderRadius.circular(28),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(28),
                            child: Column(
                              children: <Widget>[
                                _SessionHeader(controller: controller),
                                if (!controller.isConfigured)
                                  _ApiKeyPanel(
                                    controller: controller,
                                    textController: _apiKey,
                                  ),
                                if (controller.statusDetail
                                    case final String detail)
                                  _NoticeBand(
                                    icon: Icons.error_outline,
                                    text: detail,
                                  ),
                                const Divider(height: 1),
                                Expanded(
                                  child: _showEvents
                                      ? _EventTimeline(controller: controller)
                                      : _MessagesView(controller: controller),
                                ),
                                _MediaControls(controller: controller),
                                _LifecycleBar(controller: controller),
                                _SecondaryActions(
                                  showEvents: _showEvents,
                                  showDiagnostics: _showDiagnostics,
                                  keyboardExpanded: _keyboardExpanded,
                                  onEvents: () => setState(
                                    () => _showEvents = !_showEvents,
                                  ),
                                  onDiagnostics: () => setState(
                                    () => _showDiagnostics = !_showDiagnostics,
                                  ),
                                  onKeyboard: () => setState(
                                    () =>
                                        _keyboardExpanded = !_keyboardExpanded,
                                  ),
                                ),
                                if (_showDiagnostics)
                                  _DiagnosticsPanel(controller: controller),
                                if (_keyboardExpanded)
                                  _Composer(
                                    controller: controller,
                                    textController: _composer,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      );
    },
  );
}

final class _ApiKeyPanel extends StatefulWidget {
  const _ApiKeyPanel({required this.controller, required this.textController});

  final DemoController controller;
  final TextEditingController textController;

  @override
  State<_ApiKeyPanel> createState() => _ApiKeyPanelState();
}

final class _ApiKeyPanelState extends State<_ApiKeyPanel> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xFFFFF8E1),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(22, 14, 22, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            '输入 Gateway AK 以开始会话',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 6),
          const Text('AK 只保存在当前 app 进程内；关闭 app 后需要重新输入。'),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: TextField(
                  key: const Key('api-key-field'),
                  controller: widget.textController,
                  obscureText: _obscure,
                  autocorrect: false,
                  enableSuggestions: false,
                  keyboardType: TextInputType.visiblePassword,
                  textInputAction: TextInputAction.done,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: 'Gateway AK',
                    hintText: 'ak…',
                    isDense: true,
                    suffixIcon: IconButton(
                      key: const Key('toggle-api-key-visibility'),
                      onPressed: () => setState(() => _obscure = !_obscure),
                      tooltip: _obscure ? '显示 AK' : '隐藏 AK',
                      icon: Icon(
                        _obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                key: const Key('start-with-api-key-button'),
                onPressed: widget.textController.text.trim().isEmpty
                    ? null
                    : _submit,
                child: const Text('使用 AK 并开始'),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  void _submit() {
    final String apiKey = widget.textController.text;
    if (apiKey.trim().isEmpty) return;
    widget.textController.clear();
    FocusManager.instance.primaryFocus?.unfocus();
    unawaited(widget.controller.startWithApiKey(apiKey));
  }
}

final class _SessionHeader extends StatelessWidget {
  const _SessionHeader({required this.controller});

  final DemoController controller;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(22, 14, 18, 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'EVA',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 1),
              Text(
                '语音会话',
                style: TextStyle(fontSize: 13, color: Color(0xFF6C7B76)),
              ),
            ],
          ),
        ),
        _StatusBadge(
          state: controller.state,
          elapsed: controller.sessionElapsed,
        ),
      ],
    ),
  );
}

final class _LifecycleBar extends StatelessWidget {
  const _LifecycleBar({required this.controller});

  final DemoController controller;

  @override
  Widget build(BuildContext context) {
    final bool isRunning = controller.canStop;
    final Color buttonColor = isRunning
        ? Theme.of(context).colorScheme.error
        : Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 12, 28, 14),
      child: FilledButton.icon(
        key: const Key('start-button'),
        onPressed: isRunning
            ? controller.stop
            : controller.canStart
            ? controller.start
            : null,
        icon: Icon(isRunning ? Icons.call_end : Icons.mic_none_outlined),
        label: Text(isRunning ? '结束语音会话' : '开始语音会话'),
        style: FilledButton.styleFrom(
          backgroundColor: buttonColor,
          foregroundColor: Theme.of(context).colorScheme.onError,
          minimumSize: const Size.fromHeight(62),
          textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

final class _MediaControls extends StatelessWidget {
  const _MediaControls({required this.controller});

  final DemoController controller;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(22, 4, 22, 4),
    child: Row(
      children: <Widget>[
        Expanded(
          child: _CompactSwitch(
            key: const Key('microphone-switch'),
            icon: Icons.mic_outlined,
            label: '麦克风',
            value: controller.audioEnabled,
            enabled: controller.canConfigureMedia,
            onChanged: controller.setAudioEnabled,
          ),
        ),
        Expanded(
          child: _CompactSwitch(
            key: const Key('camera-switch'),
            icon: Icons.camera_alt_outlined,
            label: '摄像头',
            value: controller.cameraEnabled,
            enabled: controller.canConfigureMedia,
            onChanged: controller.setCameraEnabled,
          ),
        ),
        Expanded(
          child: _CompactSwitch(
            key: const Key('tts-switch'),
            icon: Icons.volume_up_outlined,
            label: '语音播报',
            value: controller.ttsEnabled,
            enabled: controller.canConfigureMedia,
            onChanged: controller.setTtsEnabled,
          ),
        ),
      ],
    ),
  );
}

final class _CompactSwitch extends StatelessWidget {
  const _CompactSwitch({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 20),
        Switch(value: value, onChanged: enabled ? onChanged : null),
        Text(label, style: Theme.of(context).textTheme.labelSmall),
      ],
    ),
  );
}

final class _SecondaryActions extends StatelessWidget {
  const _SecondaryActions({
    required this.showEvents,
    required this.showDiagnostics,
    required this.keyboardExpanded,
    required this.onEvents,
    required this.onDiagnostics,
    required this.onKeyboard,
  });

  final bool showEvents;
  final bool showDiagnostics;
  final bool keyboardExpanded;
  final VoidCallback onEvents;
  final VoidCallback onDiagnostics;
  final VoidCallback onKeyboard;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(22, 0, 22, 10),
    child: Row(
      children: <Widget>[
        Expanded(
          child: _SecondaryAction(
            key: const Key('keyboard-input-button'),
            onPressed: onKeyboard,
            icon: Icons.keyboard_alt_outlined,
            label: '键盘',
            selected: keyboardExpanded,
          ),
        ),
        Expanded(
          child: _SecondaryAction(
            key: const Key('events-button'),
            onPressed: onEvents,
            icon: Icons.timeline,
            label: '事件',
            selected: showEvents,
          ),
        ),
        Expanded(
          child: _SecondaryAction(
            key: const Key('diagnostics-button'),
            onPressed: onDiagnostics,
            icon: Icons.insights_outlined,
            label: '诊断',
            selected: showDiagnostics,
          ),
        ),
      ],
    ),
  );
}

final class _SecondaryAction extends StatelessWidget {
  const _SecondaryAction({
    super.key,
    required this.icon,
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final Color foreground = selected
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Tooltip(
      message: label,
      child: Material(
        color: selected
            ? Theme.of(context).colorScheme.primaryContainer
            : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            height: 58,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Icon(icon, size: 22, color: foreground),
                const SizedBox(height: 3),
                Text(
                  label,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

final class _DiagnosticsPanel extends StatelessWidget {
  const _DiagnosticsPanel({required this.controller});

  final DemoController controller;

  @override
  Widget build(BuildContext context) {
    final List<DemoEventEntry> diagnostics = controller.events
        .where(
          (DemoEventEntry entry) =>
              entry.type == EvaAgentEventType.turnLatency.wireName ||
              entry.type == EvaAgentEventType.imageCaptured.wireName,
        )
        .toList(growable: false);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(28, 0, 28, 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF5F2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFD5E2DD)),
      ),
      child: diagnostics.isEmpty
          ? const Text(
              '开始一次语音会话后，这里会显示延迟和图像采集指标。',
              style: TextStyle(color: Color(0xFF65746F)),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: diagnostics
                  .take(3)
                  .map(
                    (DemoEventEntry entry) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${entry.type}  ${entry.summary}'),
                    ),
                  )
                  .toList(growable: false),
            ),
    );
  }
}

final class _EventTimeline extends StatefulWidget {
  const _EventTimeline({required this.controller});

  final DemoController controller;

  @override
  State<_EventTimeline> createState() => _EventTimelineState();
}

final class _EventTimelineState extends State<_EventTimeline> {
  late final ScrollController _scrollController;
  int _lastEventCount = 0;
  bool _followTail = true;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleTailScroll(List<DemoEventEntry> events) {
    final int eventCount = events.length;
    if (eventCount == 0) {
      _lastEventCount = 0;
      _followTail = true;
      return;
    }
    final bool grew = eventCount > _lastEventCount;
    _lastEventCount = eventCount;
    if (!grew || !_followTail) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients || !_followTail) return;
      final double target = _scrollController.position.maxScrollExtent;
      if ((_scrollController.offset - target).abs() < 1) return;
      _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final List<DemoEventEntry> events = widget.controller.events;
    _scheduleTailScroll(events);
    if (events.isEmpty) {
      return const _EmptyState(icon: Icons.timeline, text: 'No events yet');
    }
    return Column(
      children: <Widget>[
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            key: const Key('clear-events-button'),
            onPressed: widget.controller.clearEvents,
            tooltip: 'Clear events',
            icon: const Icon(Icons.delete_sweep_outlined),
          ),
        ),
        Expanded(
          child: NotificationListener<UserScrollNotification>(
            onNotification: (UserScrollNotification notification) {
              if (notification.metrics.axis == Axis.vertical) {
                _followTail = notification.metrics.extentAfter < 48;
              }
              return false;
            },
            child: ListView.separated(
              key: const Key('event-list'),
              controller: _scrollController,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              itemCount: events.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (BuildContext context, int index) {
                final DemoEventEntry entry = events[index];
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: const Icon(Icons.bolt, size: 18),
                  title: Text(entry.type),
                  subtitle: Text(
                    <String>[
                      if (entry.turnId != null) entry.turnId!,
                      if (entry.summary.isNotEmpty) entry.summary,
                    ].join(' · '),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

final class _MessagesView extends StatefulWidget {
  const _MessagesView({required this.controller});

  final DemoController controller;

  @override
  State<_MessagesView> createState() => _MessagesViewState();
}

final class _MessagesViewState extends State<_MessagesView> {
  late final ScrollController _scrollController;
  int _lastMessageCount = 0;
  String _lastTailContent = '';
  bool _followTail = true;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleTailScroll(List<EvaConversationMessage> messages) {
    final int messageCount = messages.length;
    final String tailContent = messages.isNotEmpty ? messages.last.content : '';
    if (messageCount == 0) {
      _lastMessageCount = 0;
      _lastTailContent = '';
      _followTail = true;
      return;
    }
    final bool grew =
        messageCount > _lastMessageCount || tailContent != _lastTailContent;
    _lastMessageCount = messageCount;
    _lastTailContent = tailContent;
    if (!grew || !_followTail) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients || !_followTail) return;
      final double target = _scrollController.position.maxScrollExtent;
      if ((_scrollController.offset - target).abs() < 1) return;
      _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final List<EvaConversationMessage> messages = widget.controller.messages;
    _scheduleTailScroll(messages);
    return Column(
      children: <Widget>[
        Expanded(
          child: messages.isEmpty
              ? const _ConversationEmptyState()
              : NotificationListener<UserScrollNotification>(
                  onNotification: (UserScrollNotification notification) {
                    if (notification.metrics.axis == Axis.vertical) {
                      _followTail = notification.metrics.extentAfter < 48;
                    }
                    return false;
                  },
                  child: ListView.separated(
                    key: const Key('message-list'),
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: messages.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (BuildContext context, int index) {
                      final EvaConversationMessage message = messages[index];
                      final bool isUser = message.role.name == 'user';
                      final String roleLabel = isUser
                          ? 'USER'
                          : message.role.name == 'assistant'
                          ? 'EVA'
                          : message.role.name.toUpperCase();
                      return Align(
                        alignment: isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: 0.84,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: isUser
                                  ? Theme.of(context).colorScheme.primaryContainer
                                  : Theme.of(
                                      context,
                                    ).colorScheme.surfaceContainerHigh,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    roleLabel,
                                    style: Theme.of(context).textTheme.labelSmall,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(message.content),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

final class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.textController});

  final DemoController controller;
  final TextEditingController textController;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surface,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 12),
      child: Row(
        children: <Widget>[
          Expanded(
            child: TextField(
              key: const Key('message-field'),
              controller: textController,
              enabled: controller.canInteract,
              minLines: 1,
              maxLines: 3,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: const InputDecoration(
                hintText: '输入文字发送给 EVA',
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            key: const Key('send-button'),
            onPressed: controller.canInteract ? _send : null,
            tooltip: '发送消息',
            icon: const Icon(Icons.send),
          ),
        ],
      ),
    ),
  );

  void _send() {
    final String text = textController.text;
    if (text.trim().isEmpty) return;
    textController.clear();
    unawaited(controller.submitText(text));
  }
}

final class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.state, required this.elapsed});

  final DemoRunState state;
  final Duration elapsed;

  @override
  Widget build(BuildContext context) {
    final (Color color, String label) = switch (state) {
      DemoRunState.running => (const Color(0xFF19724B), '通话中'),
      DemoRunState.starting || DemoRunState.stopping => (
        const Color(0xFF8A5A00),
        state == DemoRunState.starting ? '连接中' : '结束中',
      ),
      DemoRunState.faulted => (const Color(0xFFB3261E), '异常'),
      DemoRunState.stopped => (const Color(0xFF5F6368), '已结束'),
      _ => (const Color(0xFF5F6368), '未开始'),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (state == DemoRunState.running ||
            elapsed > Duration.zero) ...<Widget>[
          const SizedBox(width: 8),
          Text(
            formatDemoDuration(elapsed),
            style: TextStyle(
              color: color,
              fontSize: 16,
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
        ],
      ],
    );
  }
}

final class _NoticeBand extends StatelessWidget {
  const _NoticeBand({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    ),
  );
}

final class _ConversationEmptyState extends StatelessWidget {
  const _ConversationEmptyState();

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(28, 18, 28, 12),
    child: ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 280),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 72),
          const Text(
            '准备好和 EVA 说话',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            '点击下方麦克风开始语音会话',
            style: TextStyle(fontSize: 15, color: Color(0xFF6C7B76)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}

final class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 32, color: Theme.of(context).colorScheme.outline),
        const SizedBox(height: 8),
        Text(text, style: Theme.of(context).textTheme.bodyMedium),
      ],
    ),
  );
}
