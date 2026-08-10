class DriverTrip {
  DriverTrip({
    required this.id,
    required this.bookingReference,
    required this.status,
    required this.driverAssignmentStatus,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.pickupLatitude,
    required this.pickupLongitude,
    required this.dropoffLatitude,
    required this.dropoffLongitude,
    required this.passengerCount,
    required this.luggageCount,
    this.travelDate,
    this.flightArrivalTime,
    this.flightNumber,
    this.contactName,
    this.contactPhone,
  });

  final String id;
  final String bookingReference;
  final String status;
  final String driverAssignmentStatus;
  final String pickupAddress;
  final String dropoffAddress;
  final double pickupLatitude;
  final double pickupLongitude;
  final double dropoffLatitude;
  final double dropoffLongitude;
  final int passengerCount;
  final int luggageCount;
  final DateTime? travelDate;
  final String? flightArrivalTime;
  final String? flightNumber;
  final String? contactName;
  final String? contactPhone;

  bool get isFinished => {
        'COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'PASSENGER_NO_SHOW',
        'DRIVER_NO_SHOW',
        'NO_DRIVER_AVAILABLE',
      }.contains(status);

  bool get shouldTrackLocation =>
      status == 'DRIVER_ARRIVED' || status == 'IN_PROGRESS';

  factory DriverTrip.fromJson(Map<String, dynamic> json) {
    final passenger = json['passenger'] is Map
        ? Map<String, dynamic>.from(json['passenger'] as Map)
        : const <String, dynamic>{};

    return DriverTrip(
      id: json['id']?.toString() ?? '',
      bookingReference: json['bookingReference']?.toString() ?? 'رحلة',
      status: json['status']?.toString() ?? 'UNKNOWN',
      driverAssignmentStatus:
          json['driverAssignmentStatus']?.toString() ?? 'UNKNOWN',
      pickupAddress: json['pickupAddress']?.toString() ?? '—',
      dropoffAddress: json['dropoffAddress']?.toString() ?? '—',
      pickupLatitude: _double(json['pickupLatitude']),
      pickupLongitude: _double(json['pickupLongitude']),
      dropoffLatitude: _double(json['dropoffLatitude']),
      dropoffLongitude: _double(json['dropoffLongitude']),
      passengerCount: _int(json['passengerCount']),
      luggageCount: _int(json['luggageCount']),
      travelDate: DateTime.tryParse(json['travelDate']?.toString() ?? ''),
      flightArrivalTime: json['flightArrivalTime']?.toString(),
      flightNumber: json['flightNumber']?.toString(),
      contactName: json['contactName']?.toString().trim().isNotEmpty == true
          ? json['contactName'].toString()
          : _passengerName(passenger),
      contactPhone: json['contactPhone']?.toString().trim().isNotEmpty == true
          ? json['contactPhone'].toString()
          : passenger['phone']?.toString(),
    );
  }

  static double _double(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static int _int(Object? value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String? _passengerName(Map<String, dynamic> passenger) {
    final firstName = passenger['firstName']?.toString().trim() ?? '';
    final lastName = passenger['lastName']?.toString().trim() ?? '';
    final fullName = '$firstName $lastName'.trim();
    return fullName.isEmpty ? null : fullName;
  }
}

String tripStatusLabel(String status) {
  const labels = {
    'PENDING_DISPATCH': 'بانتظار التوزيع',
    'DRIVER_ASSIGNED': 'تم تعيين السائق',
    'DRIVER_ARRIVING': 'في الطريق إلى المسافر',
    'DRIVER_ARRIVED': 'وصل إلى المسافر',
    'IN_PROGRESS': 'الرحلة قيد التنفيذ',
    'COMPLETED': 'مكتملة',
    'CANCELLED_BY_PASSENGER': 'ملغاة من المسافر',
    'CANCELLED_BY_DRIVER': 'ملغاة من السائق',
    'PASSENGER_NO_SHOW': 'المسافر لم يحضر',
    'DRIVER_NO_SHOW': 'السائق لم يحضر',
  };
  return labels[status] ?? status;
}
