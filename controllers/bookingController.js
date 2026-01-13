import Event from "../models/Event.js";
import Booking from "../models/Booking.js";
import Ticket from "../models/Ticket.js";
import QRCode from "qrcode";

// @desc Book event with seat locking & duplicate prevention
export const bookEvent = async (req, res, next) => {
  try {
    console.log("Booking event for user:", req.user._id);
    console.log("Event ID:", req.params.eventId);

    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "approved") {
      return res.status(400).json({ message: "Event not approved" });
    }

    // Check if user already booked this event
    const alreadyBooked = await Booking.findOne({
      user: req.user._id,
      event: event._id,
    });

    if (alreadyBooked) {
      return res.status(400).json({ message: "You have already booked this event" });
    }

    // Atomically decrement available seats and check if seats are available
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: event._id, availableSeats: { $gt: 0 } },
      { $inc: { availableSeats: -1 } },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(400).json({ message: "No seats available" });
    }

    // Create booking
    const booking = await Booking.create({
      user: req.user._id,
      event: event._id,
    });

    // Generate ticket ID
    const ticketId = `TKT-${event._id.toString().slice(-6).toUpperCase()}-${req.user._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;

    // Generate QR code
    const qrCodeData = JSON.stringify({
      ticketId,
      eventId: event._id,
      userId: req.user._id,
      eventTitle: event.title,
      eventDate: event.eventDate,
    });

    const qrCode = await QRCode.toDataURL(qrCodeData);

    // Create ticket
    const ticket = await Ticket.create({
      ticketId,
      booking: booking._id,
      user: req.user._id,
      event: event._id,
      qrCode,
      expiresAt: event.eventDate,
    });

    // Link ticket to booking
    booking.ticket = ticket._id;
    await booking.save();

    console.log("Booking successful for ticket:", ticketId);

    return res.status(201).json({
      success: true,
      message: "Booking confirmed",
      ticketId,
      booking: booking,
      ticket: ticket,
    });

  } catch (error) {
    console.error("Booking error:", error);

    // Handle specific errors
    if (error.name === 'MongoServerError' && error.code === 11000) {
      console.log("Duplicate key error details:", error.keyPattern, error.keyValue);
      return res.status(400).json({
        success: false,
        message: "Duplicate booking detected",
        details: error.keyValue
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error during booking"
    });
  }
};



// @desc Get logged in user bookings
export const getMyBookings = async (req, res, next) => { // ✅ ADD 'next' parameter here too
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate("event", "title eventDate location")
      .populate("ticket");
    return res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings"
    });
  }
};