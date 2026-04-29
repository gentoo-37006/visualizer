// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:auton_path_planner/main.dart';

void main() {
  testWidgets('Decode image renders in a scalable square',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    final imageFinder = find.byType(Image);
    expect(imageFinder, findsOneWidget);

    final imageWidget = tester.widget<Image>(imageFinder);
    expect(imageWidget.image, isA<AssetImage>());
    final asset = imageWidget.image as AssetImage;
    expect(asset.assetName, 'web/fields/decode.webp');
  });
}
