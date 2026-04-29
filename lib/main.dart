import 'package:flutter/material.dart';

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
  final ValueNotifier<Offset> _pointPosition = ValueNotifier<Offset>(
    const Offset(0.5, 0.5),
  );
  static const double _pointDiameter = 16;
  static const double _fieldSizeInches = 144;
  static const double _borderWidth = 3;
  bool _isDragging = false;

  @override
  void dispose() {
    _pointPosition.dispose();
    super.dispose();
  }

  void _updatePoint(Offset localPosition, double fieldSize) {
    if (fieldSize <= 0) {
      return;
    }
    final radius = _pointDiameter / 2;
    final offset = radius + _borderWidth;
    final imageLocal = localPosition - Offset(offset, offset);
    final clampedX = imageLocal.dx.clamp(0.0, fieldSize);
    final clampedY = imageLocal.dy.clamp(0.0, fieldSize);
    _pointPosition.value = Offset(clampedX / fieldSize, clampedY / fieldSize);
  }

  bool _isOnPoint(Offset localPosition, double fieldSize) {
    final radius = _pointDiameter / 2;
    final offset = radius + _borderWidth;
    final pointCenter = Offset(
      _pointPosition.value.dx * fieldSize + offset,
      _pointPosition.value.dy * fieldSize + offset,
    );
    return (localPosition - pointCenter).distance <= radius;
  }

  Offset _toFieldCoords(Offset normalized) {
    final x = (normalized.dx - 0.5) * _fieldSizeInches;
    final y = (0.5 - normalized.dy) * _fieldSizeInches;
    return Offset(x, y);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF171717),
      body: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  // Scale the square to the available space while preserving aspect.
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final outerSize = constraints.biggest.shortestSide;
                      final fieldSize = (outerSize - _pointDiameter).clamp(
                        0.0,
                        outerSize,
                      );
                      final innerFieldSize = (fieldSize - _borderWidth * 2)
                          .clamp(0.0, fieldSize);
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
                              if (_isOnPoint(
                                details.localPosition,
                                innerFieldSize,
                              )) {
                                setState(() {
                                  _isDragging = true;
                                });
                                _updatePoint(
                                  details.localPosition,
                                  innerFieldSize,
                                );
                              }
                            },
                            onPanUpdate: (details) {
                              if (_isDragging) {
                                _updatePoint(
                                  details.localPosition,
                                  innerFieldSize,
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
                                  width: fieldSize,
                                  height: fieldSize,
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
                                        image: AssetImage(
                                          'web/fields/decode.webp',
                                        ),
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                ),
                                ValueListenableBuilder<Offset>(
                                  valueListenable: _pointPosition,
                                  builder: (context, point, child) {
                                    final pointRadius = _pointDiameter / 2;
                                    final pointCenter = Offset(
                                      point.dx * innerFieldSize +
                                          pointRadius +
                                          _borderWidth,
                                      point.dy * innerFieldSize +
                                          pointRadius +
                                          _borderWidth,
                                    );
                                    final left = pointCenter.dx - pointRadius;
                                    final top = pointCenter.dy - pointRadius;

                                    return Positioned(
                                      left: left,
                                      top: top,
                                      child: MouseRegion(
                                        cursor: _isDragging
                                            ? SystemMouseCursors.grabbing
                                            : SystemMouseCursors.click,
                                        child: Container(
                                          width: _pointDiameter,
                                          height: _pointDiameter,
                                          decoration: const BoxDecoration(
                                            color: Colors.redAccent,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      ),
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
            ),
            Container(
              width: 220,
              padding: const EdgeInsets.all(16),
              color: const Color(0xFF1E1E1E),
              child: ValueListenableBuilder<Offset>(
                valueListenable: _pointPosition,
                builder: (context, point, child) {
                  final field = _toFieldCoords(point);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Point Position',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'x: ${field.dx.toStringAsFixed(1)} in',
                        style: const TextStyle(color: Colors.white70),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'y: ${field.dy.toStringAsFixed(1)} in',
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
