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
  // Normalized (0..1) position of the point on the field.
  final ValueNotifier<List<Offset>> _points = ValueNotifier<List<Offset>>([
    const Offset(0.5, 0.5),
  ]);
  final ValueNotifier<int> _pointCount = ValueNotifier<int>(1);
  final ValueNotifier<List<Color>> _pointColors = ValueNotifier<List<Color>>([
    const Color(0xFFFF5252),
  ]);
  final Random _random = Random();
  final List<TextEditingController> _xControllers = [];
  final List<TextEditingController> _yControllers = [];
  final List<FocusNode> _xFocusNodes = [];
  final List<FocusNode> _yFocusNodes = [];
  static const double _pointDiameter = 16;
  static const double _fieldSizeInches = 144;
  static const double _borderWidth = 3;
  bool _isDragging = false;
  int _activeIndex = 0;

  @override
  void initState() {
    super.initState();
    _addControllersForPoint(_points.value.first);
  }

  @override
  void dispose() {
    _points.dispose();
    _pointCount.dispose();
    _pointColors.dispose();
    for (final controller in _xControllers) {
      controller.dispose();
    }
    for (final controller in _yControllers) {
      controller.dispose();
    }
    for (final node in _xFocusNodes) {
      node.dispose();
    }
    for (final node in _yFocusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  void _addControllersForPoint(Offset point) {
    final field = _toFieldCoords(point);
    _xControllers.add(TextEditingController(text: field.dx.toStringAsFixed(1)));
    _yControllers.add(TextEditingController(text: field.dy.toStringAsFixed(1)));
    _xFocusNodes.add(FocusNode());
    _yFocusNodes.add(FocusNode());
  }

  void _syncControllersForIndex(int index) {
    if (index < 0 || index >= _points.value.length) {
      return;
    }
    final field = _toFieldCoords(_points.value[index]);
    if (!_xFocusNodes[index].hasFocus) {
      _xControllers[index].text = field.dx.toStringAsFixed(1);
    }
    if (!_yFocusNodes[index].hasFocus) {
      _yControllers[index].text = field.dy.toStringAsFixed(1);
    }
  }

  void _setPointAt(int index, Offset value) {
    if (index < 0 || index >= _points.value.length) {
      return;
    }
    final next = List<Offset>.from(_points.value);
    next[index] = value;
    _points.value = next;
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

  void _addPoint() {
    final next = List<Offset>.from(_points.value);
    final seed = next.isNotEmpty ? next.last : const Offset(0.5, 0.5);
    next.add(seed);
    final nextColors = List<Color>.from(_pointColors.value);
    nextColors.add(_randomColor());
    _addControllersForPoint(seed);
    setState(() {
      _activeIndex = next.length - 1;
    });
    _points.value = next;
    _pointColors.value = nextColors;
    _pointCount.value = next.length;
  }

  void _updatePoint(Offset localPosition, double fieldSize, int index) {
    if (fieldSize <= 0) {
      return;
    }
    final radius = _pointDiameter / 2;
    final offset = radius + _borderWidth;
    final imageLocal = localPosition - Offset(offset, offset);
    final clampedX = imageLocal.dx.clamp(0.0, fieldSize);
    final clampedY = imageLocal.dy.clamp(0.0, fieldSize);
    _setPointAt(index, Offset(clampedX / fieldSize, clampedY / fieldSize));
  }

  int _hitTestPoint(Offset localPosition, double fieldSize) {
    final radius = _pointDiameter / 2;
    final offset = radius + _borderWidth;
    for (var i = _points.value.length - 1; i >= 0; i--) {
      final pointCenter = Offset(
        _points.value[i].dx * fieldSize + offset,
        _points.value[i].dy * fieldSize + offset,
      );
      if ((localPosition - pointCenter).distance <= radius) {
        return i;
      }
    }
    return -1;
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

  double _parseOrZero(String text) => double.tryParse(text) ?? 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF171717),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            const sidebarMinWidth = 220.0;
            const gap = 16.0;
            final maxWidth = constraints.maxWidth;
            final maxHeight = constraints.maxHeight;
            final availableForField = (maxWidth - sidebarMinWidth - gap).clamp(
              0.0,
              maxWidth,
            );
            final fieldSize = availableForField < maxHeight
                ? availableForField
                : maxHeight;

            return Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  SizedBox(
                    width: fieldSize,
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

                          return SizedBox.square(
                            dimension: outerSize,
                            child: MouseRegion(
                              cursor: _isDragging
                                  ? SystemMouseCursors.grabbing
                                  : SystemMouseCursors.basic,
                              child: GestureDetector(
                                behavior: HitTestBehavior.translucent,
                                onPanDown: (details) {
                                  final hitIndex = _hitTestPoint(
                                    details.localPosition,
                                    innerFieldSize,
                                  );
                                  if (hitIndex >= 0) {
                                    setState(() {
                                      _isDragging = true;
                                      _activeIndex = hitIndex;
                                    });
                                    _updatePoint(
                                      details.localPosition,
                                      innerFieldSize,
                                      hitIndex,
                                    );
                                  }
                                },
                                onPanUpdate: (details) {
                                  if (_isDragging && _activeIndex >= 0) {
                                    _updatePoint(
                                      details.localPosition,
                                      innerFieldSize,
                                      _activeIndex,
                                    );
                                  }
                                },
                                onPanEnd: (_) => setState(() {
                                  _isDragging = false;
                                }),
                                onPanCancel: () => setState(() {
                                  _isDragging = false;
                                }),
                                child: Stack(
                                  clipBehavior: Clip.none,
                                  children: [
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
                                          borderRadius: BorderRadius.circular(
                                            5,
                                          ),
                                        ),
                                        clipBehavior: Clip.antiAlias,
                                        child: const RepaintBoundary(
                                          child: Image(
                                            image: AssetImage(
                                              'web/fields/decode.webp',
                                            ),
                                            fit: BoxFit.cover,
                                          ),
                                        ),
                                      ),
                                    ),
                                    ValueListenableBuilder<List<Offset>>(
                                      valueListenable: _points,
                                      builder: (context, points, child) {
                                        return Positioned.fill(
                                          child: CustomPaint(
                                            painter: _PointPathPainter(
                                              points: points,
                                              colors: _pointColors.value,
                                              fieldSize: innerFieldSize,
                                              offset:
                                                  _pointDiameter / 2 +
                                                  _borderWidth,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                    ValueListenableBuilder<List<Offset>>(
                                      valueListenable: _points,
                                      builder: (context, points, child) {
                                        return Stack(
                                          children: [
                                            for (
                                              var i = 0;
                                              i < points.length;
                                              i++
                                            )
                                              _PointMarker(
                                                point: points[i],
                                                fieldSize: innerFieldSize,
                                                borderOffset: _borderWidth,
                                                isDragging: _isDragging,
                                                color: _pointColors.value[i],
                                              ),
                                          ],
                                        );
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(width: gap),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      color: const Color(0xFF1E1E1E),
                      child: ValueListenableBuilder<int>(
                        valueListenable: _pointCount,
                        builder: (context, pointCount, child) {
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
                                  itemCount: pointCount,
                                  separatorBuilder: (context, index) =>
                                      const SizedBox(height: 12),
                                  itemBuilder: (context, index) {
                                    return Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF262626),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: _pointColors.value[index],
                                        ),
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
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
                                            onChanged: (value) {
                                              final x = _parseOrZero(value);
                                              final y = _parseOrZero(
                                                _yControllers[index].text,
                                              );
                                              _setPointAt(
                                                index,
                                                _toNormalizedCoords(x, y),
                                              );
                                            },
                                          ),
                                          const SizedBox(height: 8),
                                          _CoordField(
                                            label: 'y',
                                            controller: _yControllers[index],
                                            focusNode: _yFocusNodes[index],
                                            onChanged: (value) {
                                              final x = _parseOrZero(
                                                _xControllers[index].text,
                                              );
                                              final y = _parseOrZero(value);
                                              _setPointAt(
                                                index,
                                                _toNormalizedCoords(x, y),
                                              );
                                            },
                                          ),
                                        ],
                                      ),
                                    );
                                  },
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
                  ),
                ],
              ),
            );
          },
        ),
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
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            onChanged: onChanged,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              labelText: label,
              labelStyle: const TextStyle(color: Colors.white70),
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
          ),
        ),
      ],
    );
  }
}

class _PointMarker extends StatelessWidget {
  const _PointMarker({
    required this.point,
    required this.fieldSize,
    required this.borderOffset,
    required this.isDragging,
    required this.color,
  });

  final Offset point;
  final double fieldSize;
  final double borderOffset;
  final bool isDragging;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final pointRadius = _FieldPageState._pointDiameter / 2;
    final pointCenter = Offset(
      point.dx * fieldSize + pointRadius + borderOffset,
      point.dy * fieldSize + pointRadius + borderOffset,
    );
    final left = pointCenter.dx - pointRadius;
    final top = pointCenter.dy - pointRadius;

    return Positioned(
      left: left,
      top: top,
      child: MouseRegion(
        cursor: isDragging
            ? SystemMouseCursors.grabbing
            : SystemMouseCursors.click,
        child: Container(
          width: _FieldPageState._pointDiameter,
          height: _FieldPageState._pointDiameter,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
      ),
    );
  }
}

class _PointPathPainter extends CustomPainter {
  _PointPathPainter({
    required this.points,
    required this.colors,
    required this.fieldSize,
    required this.offset,
  });

  final List<Offset> points;
  final List<Color> colors;
  final double fieldSize;
  final double offset;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) {
      return;
    }
    final paint = Paint()
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i < points.length - 1; i++) {
      paint.color = colors.length > i + 1 ? colors[i + 1] : Colors.white70;
      final a = Offset(
        points[i].dx * fieldSize + offset,
        points[i].dy * fieldSize + offset,
      );
      final b = Offset(
        points[i + 1].dx * fieldSize + offset,
        points[i + 1].dy * fieldSize + offset,
      );
      canvas.drawLine(a, b, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _PointPathPainter oldDelegate) {
    return oldDelegate.points != points ||
        oldDelegate.colors != colors ||
        oldDelegate.fieldSize != fieldSize ||
        oldDelegate.offset != offset;
  }
}
