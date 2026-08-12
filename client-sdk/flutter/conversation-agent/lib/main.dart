import 'package:flutter/material.dart';

import 'demo_app.dart';
import 'sdk_usage.dart';

void main() =>
    runApp(EvaDemoApp(configuration: DemoConfiguration.fromEnvironment()));
