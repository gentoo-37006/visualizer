import 'package:flutter/material.dart';

class FieldPainter extends CustomPainter {
  final List<Offset> points;
  final List<Color> colors;
  final int hoverIndex;
  final double fieldSize;
  final double offset;
  final double pointRadius;

  FieldPainter({
    required this.points,
    required this.colors,
    required this.hoverIndex,
    required this.fieldSize,
    required this.offset,
    required this.pointRadius,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final linePaint = Paint()
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final pointPaint = Paint()..style = PaintingStyle.fill;

    final shadowPaint = Paint()
      ..color = Colors.black45
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    // 1. Draw Lines
    for (int i = 0; i < points.length - 1; i++) {
      linePaint.color = colors[i + 1];
      canvas.drawLine(
        Offset(
          points[i].dx * fieldSize + offset,
          points[i].dy * fieldSize + offset,
        ),
        Offset(
          points[i + 1].dx * fieldSize + offset,
          points[i + 1].dy * fieldSize + offset,
        ),
        linePaint,
      );
    }

    // 2. Draw Points
    for (int i = 0; i < points.length; i++) {
      final center = Offset(
        points[i].dx * fieldSize + offset,
        points[i].dy * fieldSize + offset,
      );

      // Shadow if hovered
      if (i == hoverIndex) {
        canvas.drawCircle(center + const Offset(0, 2), pointRadius, shadowPaint);
      }

      // Point circle
      pointPaint.color = colors[i];
      canvas.drawCircle(center, pointRadius, pointPaint);

      // Hover border
      if (i == hoverIndex) {
        canvas.drawCircle(
          center,
          pointRadius,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant FieldPainter old) =>
      old.points != points ||
      old.hoverIndex != hoverIndex ||
      old.fieldSize != fieldSize;
}
