import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Auton Path Planner',
      theme: ThemeData.dark(),
      home: const FieldPage(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class FieldPage extends StatefulWidget {
  const FieldPage({super.key});

  @override
  State<FieldPage> createState() => _FieldPageState();
}

class _FieldPageState extends State<FieldPage> {
  final List<ValueNotifier<Offset>> _points = [];
  final List<Color> _pointColors = [];
  final List<TextEditingController> _xControllers = [];
  final List<TextEditingController> _yControllers = [];
  final List<FocusNode> _xFocusNodes = [];
  final List<FocusNode> _yFocusNodes = [];

  final ValueNotifier<int> _pointCount = ValueNotifier(0);
  final ValueNotifier<int> _hoverIndex = ValueNotifier(-1);
  final ValueNotifier<int> _activeIndex = ValueNotifier(-1);
  final ValueNotifier<bool> _isDragging = ValueNotifier(false);

  final Random _random = Random();
  static const double _pointDiameter = 16;
  static const double _fieldSizeInches = 144;
  static const double _borderWidth = 3;

  @override
  void initState() {
    super.initState();
    _addPointSync(const Offset(0.5, 0.5));
  }

  @override
  void dispose() {
    for (final p in _points) {
      p.dispose();
    }
    _pointCount.dispose();
    _hoverIndex.dispose();
    _activeIndex.dispose();
    _isDragging.dispose();
    for (final c in _xControllers) {
      c.dispose();
    }
    for (final c in _yControllers) {
      c.dispose();
    }
    for (final n in _xFocusNodes) {
      n.dispose();
    }
    for (final n in _yFocusNodes) {
      n.dispose();
    }
    super.dispose();
  }

  void _addPointSync(Offset point) {
    final color = _randomColor();
    _points.add(ValueNotifier(point));
    _pointColors.add(color);
    _addControllersForPoint(point);
    _pointCount.value = _points.length;
  }

  void _addPoint() {
    final seed = _points.isNotEmpty
        ? _points.last.value
        : const Offset(0.5, 0.5);
    _addPointSync(seed);
    _activeIndex.value = _points.length - 1;
  }

  void _addControllersForPoint(Offset point) {
    final field = _toFieldCoords(point);
    _xControllers.add(TextEditingController(text: field.dx.toStringAsFixed(1)));
    _yControllers.add(TextEditingController(text: field.dy.toStringAsFixed(1)));
    _xFocusNodes.add(FocusNode());
    _yFocusNodes.add(FocusNode());
  }

  void _syncControllersForIndex(int index) {
    if (index < 0 || index >= _points.length) return;
    final field = _toFieldCoords(_points[index].value);
    if (!_xFocusNodes[index].hasFocus) {
      final nextX = field.dx.toStringAsFixed(1);
      if (_xControllers[index].text != nextX) {
        _xControllers[index].text = nextX;
      }
    }
    if (!_yFocusNodes[index].hasFocus) {
      final nextY = field.dy.toStringAsFixed(1);
      if (_yControllers[index].text != nextY) {
        _yControllers[index].text = nextY;
      }
    }
  }

  void _setPointAt(int index, Offset value) {
    if (index < 0 || index >= _points.length) return;
    _points[index].value = value;
    _syncControllersForIndex(index);
  }

  Color _randomColor() {
    const minChannel = 120;
    const range = 256 - minChannel;
    return Color.fromARGB(
      255,
      _random.nextInt(range) + minChannel,
      _random.nextInt(range) + minChannel,
      _random.nextInt(range) + minChannel,
    );
  }

  int _hitTestPoint(Offset localPosition, double fieldSize) {
    const radius = _pointDiameter / 2;
    const offset = radius + _borderWidth;
    for (var i = _points.length - 1; i >= 0; i--) {
      final pointCenter = Offset(
        _points[i].value.dx * fieldSize + offset,
        _points[i].value.dy * fieldSize + offset,
      );
      if ((localPosition - pointCenter).distance <= radius) return i;
    }
    return -1;
  }

  void _updatePoint(Offset localPosition, double fieldSize, int index) {
    if (fieldSize <= 0) return;
    const offset = _pointDiameter / 2 + _borderWidth;
    final imageLocal = localPosition - const Offset(offset, offset);
    final clampedX = imageLocal.dx.clamp(0.0, fieldSize);
    final clampedY = imageLocal.dy.clamp(0.0, fieldSize);
    _setPointAt(index, Offset(clampedX / fieldSize, clampedY / fieldSize));
  }

  Offset _toFieldCoords(Offset normalized) {
    final x = (normalized.dx - 0.5) * _fieldSizeInches;
    final y = (0.5 - normalized.dy) * _fieldSizeInches;
    return Offset(x, y);
  }

  Offset _toNormalizedCoords(double x, double y) {
    final nx = (x / _fieldSizeInches) + 0.5;
    final ny = 0.5 - (y / _fieldSizeInches);
    return Offset(nx.clamp(0.0, 1.0), ny.clamp(0.0, 1.0));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF171717),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            const sidebarMinWidth = 220.0;
            const gap = 16.0;
            final fieldSizeAvailable =
                (constraints.maxWidth - sidebarMinWidth - gap).clamp(
                  0.0,
                  constraints.maxWidth,
                );
            final fieldDisplaySize = min(
              fieldSizeAvailable,
              constraints.maxHeight,
            );

            return Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  SizedBox(
                    width: fieldDisplaySize,
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final outerSize = constraints.biggest.shortestSide;
                          final innerFieldSize =
                              (outerSize - _pointDiameter - _borderWidth * 2)
                                  .clamp(0.0, outerSize);
                          final framedSize = innerFieldSize + _borderWidth * 2;
                          if (innerFieldSize <= 0) {
                            return const SizedBox.shrink();
                          }

                          return _buildFieldContainer(
                            innerFieldSize,
                            framedSize,
                            outerSize,
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(width: gap),
                  _buildSidebar(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildFieldContainer(
    double innerFieldSize,
    double framedSize,
    double outerSize,
  ) {
    return SizedBox.square(
      dimension: outerSize,
      child: ValueListenableBuilder<bool>(
        valueListenable: _isDragging,
        builder: (context, isDragging, child) {
          return ValueListenableBuilder<int>(
            valueListenable: _hoverIndex,
            builder: (context, hoverIndex, child) {
              return MouseRegion(
                cursor: isDragging
                    ? SystemMouseCursors.grabbing
                    : (hoverIndex >= 0
                          ? SystemMouseCursors.click
                          : SystemMouseCursors.basic),
                onEnter: (event) =>
                    _onMouseHover(event.localPosition, innerFieldSize),
                onHover: (event) =>
                    _onMouseHover(event.localPosition, innerFieldSize),
                onExit: (_) => _hoverIndex.value = -1,
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onPanDown: (details) {
                    final hitIndex = _hitTestPoint(
                      details.localPosition,
                      innerFieldSize,
                    );
                    if (hitIndex >= 0) {
                      _isDragging.value = true;
                      _activeIndex.value = hitIndex;
                      _hoverIndex.value = hitIndex;
                      _updatePoint(
                        details.localPosition,
                        innerFieldSize,
                        hitIndex,
                      );
                    }
                  },
                  onPanUpdate: (details) {
                    if (_isDragging.value && _activeIndex.value >= 0) {
                      _updatePoint(
                        details.localPosition,
                        innerFieldSize,
                        _activeIndex.value,
                      );
                    }
                  },
                  onPanEnd: (_) => _endDragging(),
                  onPanCancel: () => _endDragging(),
                  child: child,
                ),
              );
            },
            child: _buildFieldStack(innerFieldSize, framedSize),
          );
        },
      ),
    );
  }

  void _onMouseHover(Offset localPosition, double fieldSize) {
    if (_isDragging.value) return;
    final hitIndex = _hitTestPoint(localPosition, fieldSize);
    if (hitIndex != _hoverIndex.value) {
      _hoverIndex.value = hitIndex;
    }
  }

  void _endDragging() {
    _isDragging.value = false;
    _hoverIndex.value = -1;
    _syncControllersForIndex(_activeIndex.value);
  }

  Widget _buildFieldStack(double innerFieldSize, double framedSize) {
    final offset = _pointDiameter / 2 + _borderWidth;

    return ValueListenableBuilder<int>(
      valueListenable: _pointCount,
      builder: (context, count, _) {
        return Stack(
          clipBehavior: Clip.none,
          children: [
            // Background Image
            Positioned(
              left: _pointDiameter / 2,
              top: _pointDiameter / 2,
              width: framedSize,
              height: framedSize,
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(
                    color: Colors.white30,
                    width: _borderWidth,
                  ),
                  borderRadius: BorderRadius.circular(5),
                ),
                clipBehavior: Clip.antiAlias,
                child: const RepaintBoundary(
                  child: Image(
                    image: AssetImage('web/fields/decode.webp'),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),
            // Line Segments
            for (int i = 0; i < count - 1; i++)
              _LineSegment(
                p1: _points[i],
                p2: _points[i + 1],
                color: _pointColors[i + 1],
                fieldSize: innerFieldSize,
                offset: offset,
              ),
            // Points
            for (int i = 0; i < count; i++)
              _PointMarker(
                index: i,
                position: _points[i],
                color: _pointColors[i],
                hoverIndex: _hoverIndex,
                fieldSize: innerFieldSize,
                offset: offset,
                radius: _pointDiameter / 2,
              ),
          ],
        );
      },
    );
  }

  Widget _buildSidebar() {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        color: const Color(0xFF1E1E1E),
        child: ValueListenableBuilder<int>(
          valueListenable: _pointCount,
          builder: (context, count, _) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Point Positions',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView.separated(
                    itemCount: count,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) => _buildPointEditor(index),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _addPoint,
                    child: const Text('Add Point'),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildPointEditor(int index) {
    return RepaintBoundary(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF262626),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _pointColors[index]),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Point ${index + 1}',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            _CoordField(
              label: 'x',
              controller: _xControllers[index],
              focusNode: _xFocusNodes[index],
              onChanged: (val) {
                final x = double.tryParse(val) ?? 0;
                final y = double.tryParse(_yControllers[index].text) ?? 0;
                _setPointAt(index, _toNormalizedCoords(x, y));
              },
            ),
            const SizedBox(height: 8),
            _CoordField(
              label: 'y',
              controller: _yControllers[index],
              focusNode: _yFocusNodes[index],
              onChanged: (val) {
                final x = double.tryParse(_xControllers[index].text) ?? 0;
                final y = double.tryParse(val) ?? 0;
                _setPointAt(index, _toNormalizedCoords(x, y));
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _LineSegment extends StatelessWidget {
  const _LineSegment({
    required this.p1,
    required this.p2,
    required this.color,
    required this.fieldSize,
    required this.offset,
  });

  final ValueNotifier<Offset> p1;
  final ValueNotifier<Offset> p2;
  final Color color;
  final double fieldSize;
  final double offset;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: Listenable.merge([p1, p2]),
          builder: (context, _) {
            return CustomPaint(
              painter: _LinePainter(
                p1: p1.value,
                p2: p2.value,
                color: color,
                fieldSize: fieldSize,
                offset: offset,
              ),
            );
          },
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.p1,
    required this.p2,
    required this.color,
    required this.fieldSize,
    required this.offset,
  });

  final Offset p1;
  final Offset p2;
  final Color color;
  final double fieldSize;
  final double offset;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(
      Offset(p1.dx * fieldSize + offset, p1.dy * fieldSize + offset),
      Offset(p2.dx * fieldSize + offset, p2.dy * fieldSize + offset),
      paint,
    );
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.p1 != p1 ||
      old.p2 != p2 ||
      old.fieldSize != fieldSize ||
      old.color != color;
}

class _PointMarker extends StatelessWidget {
  const _PointMarker({
    required this.index,
    required this.position,
    required this.color,
    required this.hoverIndex,
    required this.fieldSize,
    required this.offset,
    required this.radius,
  });

  final int index;
  final ValueNotifier<Offset> position;
  final Color color;
  final ValueNotifier<int> hoverIndex;
  final double fieldSize;
  final double offset;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Offset>(
      valueListenable: position,
      builder: (context, pos, child) {
        return Positioned(
          left: pos.dx * fieldSize + offset - radius,
          top: pos.dy * fieldSize + offset - radius,
          child: child!,
        );
      },
      child: ValueListenableBuilder<int>(
        valueListenable: hoverIndex,
        builder: (context, hover, _) {
          final isHovered = hover == index;
          return Container(
            width: radius * 2,
            height: radius * 2,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: isHovered
                  ? Border.all(color: Colors.white, width: 2)
                  : null,
              boxShadow: isHovered
                  ? [
                      const BoxShadow(
                        color: Colors.black45,
                        blurRadius: 4,
                        offset: Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
          );
        },
      ),
    );
  }
}

class _CoordField extends StatelessWidget {
  const _CoordField({
    required this.label,
    required this.controller,
    required this.focusNode,
    required this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      onChanged: onChanged,
      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white70),
        isDense: true,
        enabledBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Colors.white30, width: 2),
          borderRadius: BorderRadius.circular(8),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Colors.blue, width: 2),
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      keyboardType: const TextInputType.numberWithOptions(
        decimal: true,
        signed: true,
      ),
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'^-?\d*\.?\d*$')),
      ],
    );
  }
}
