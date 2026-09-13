import type { RealityService } from "./service.ts";
import { TripInput, type PlaceT, type TripQuote } from "./contracts.ts";
import type { z } from "zod";
import { assert, hash, id, now } from "./util.ts";
import { eventStart, meetingKind, eligible } from "./time.ts";
type TripRequest = z.infer<typeof TripInput>;
interface Route {
  seconds: number;
  polyline: string;
  traffic: boolean;
}
export function mapsUrl(origin: PlaceT, destination: PlaceT, stop?: PlaceT) {
  const value = (p: PlaceT) =>
    p.address || (p.lat !== undefined ? `${p.lat},${p.lng}` : p.label);
  const p = new URLSearchParams({
    api: "1",
    origin: value(origin),
    destination: value(destination),
    travelmode: "driving",
  });
  if (origin.placeId) p.set("origin_place_id", origin.placeId);
  if (destination.placeId) p.set("destination_place_id", destination.placeId);
  if (stop) {
    p.set("waypoints", value(stop));
    if (stop.placeId) p.set("waypoint_place_ids", stop.placeId);
  }
  return "https://www.google.com/maps/dir/?" + p;
}
export function stopComparison(
  baseline: number,
  drive: number,
  dwell: number,
  maxAdded: number,
  arrival: number,
  target: number,
) {
  const added = Math.max(0, drive + dwell * 60 - baseline);
  return {
    addedSeconds: added,
    fits: added <= maxAdded * 60 && arrival <= target,
  };
}
export class Maps {
  // Quotes contain restricted provider content. They are transient and expire in five minutes.
  quotes = new Map<
    string,
    { quote: TripQuote; input: TripRequest; expires: number }
  >();
  private routeTokens = 0;
  constructor(public service: RealityService) {}
  usage() {
    return (
      this.service.store.get(
        "usage",
        `maps:${new Date().toISOString().slice(0, 10)}`,
      ) || { requests: 0 }
    );
  }
  async api(endpoint: string, body: unknown, fields: string) {
    assert(
      process.env.GOOGLE_MAPS_API_KEY,
      "Google Maps is not configured. Add a restricted API key locally.",
    );
    assert(
      /^https:\/\//.test(this.service.config().policyUrl),
      "Publish and configure the Terms/Privacy policy URL before enabling Maps.",
    );
    const key = `maps:${new Date().toISOString().slice(0, 10)}`;
    this.service.store.transaction(() => {
      const usage = this.service.store.get("usage", key) || { requests: 0 };
      assert(
        usage.requests < this.service.config().maxMapsRequestsPerDay,
        "The local Google Maps daily request limit has been reached.",
      );
      this.service.store.put("usage", key, { requests: usage.requests + 1 });
    });
    let r: Response;
    try {
      r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": fields,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        "Google Maps is unavailable. No travel estimate was produced.",
      );
    }
    assert(
      r.ok,
      `Google Maps request failed (HTTP ${r.status}). No estimate was fabricated.`,
    );
    return r.json();
  }
  waypoint(p: PlaceT) {
    return p.placeId
      ? { placeId: p.placeId }
      : p.lat !== undefined
        ? { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
        : { address: p.address };
  }
  async route(
    origin: PlaceT,
    destination: PlaceT,
    departure: string,
  ): Promise<Route> {
    const data: any = await this.api(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: this.waypoint(origin),
        destination: this.waypoint(destination),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: departure,
        computeAlternativeRoutes: false,
      },
      "routes.duration,routes.polyline.encodedPolyline,fallbackInfo",
    );
    assert(data.routes?.length, "No driving route was found.");
    const route = data.routes[0];
    const seconds = Number(String(route.duration).replace(/s$/, ""));
    assert(
      Number.isFinite(seconds) && seconds > 0,
      "Route duration is unavailable.",
    );
    return {
      seconds,
      polyline: route.polyline?.encodedPolyline || "",
      traffic: !data.fallbackInfo,
    };
  }
  async search(polyline: string, kind: string, connector?: string) {
    const queries: Record<string, string> = {
      gas: "gas station",
      coffee: "coffee shop",
      pharmacy: "pharmacy",
      ev: "EV charging station",
    };
    const data: any = await this.api(
      "https://places.googleapis.com/v1/places:searchText",
      {
        textQuery: queries[kind],
        maxResultCount: 10,
        searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
      },
      "places.id,places.displayName,places.formattedAddress,places.currentOpeningHours,places.evChargeOptions,places.attributions",
    );
    return (data.places || [])
      .filter((p: any) => p.currentOpeningHours?.openNow !== false)
      .filter(
        (p: any) =>
          kind !== "ev" ||
          p.evChargeOptions?.connectorAggregation?.some(
            (c: any) => c.type === connector,
          ),
      )
      .slice(0, 3);
  }
  async resolvePlace(query: string) {
    assert(query.trim().length >= 3, "Enter an address or place name.");
    assert(
      this.service.providers.mode === "live",
      "Place resolution requires live Google Maps; fixture places remain synthetic.",
    );
    const data: any = await this.api(
      "https://places.googleapis.com/v1/places:searchText",
      { textQuery: query, maxResultCount: 5 },
      "places.id,places.displayName,places.formattedAddress,places.attributions",
    );
    return {
      places: (data.places || []).map((p: any) => ({
        placeId: p.id,
        label: p.displayName?.text || query,
        address: p.formattedAddress,
        attributions: p.attributions,
        confirmed: true,
      })),
      attribution: "Google Maps",
    };
  }
  async confirmedPlace(place: PlaceT) {
    if (
      place.placeId ||
      place.lat !== undefined ||
      this.service.providers.mode === "fixture"
    )
      return place;
    const result = await this.resolvePlace(place.address || place.label);
    assert(
      result.places.length === 1,
      "This address has multiple or no matches. Resolve it and choose a specific place before routing.",
    );
    return { ...place, placeId: result.places[0].placeId };
  }
  async calculate(raw: unknown) {
    const input = TripInput.parse(raw);
    const event = this.service.currentEvent(input.eventId);
    assert(
      eligible(event.event),
      "Canceled or declined meetings cannot be routed.",
    );
    assert(
      !event.unresolved.some((f) => f === "start" || f === "launchDate"),
      "Meeting time is unresolved. Review candidate meetings first.",
    );
    const current = await this.service.providers.calendarGet(
      event.calendarId,
      event.event.id,
    );
    assert(
      hash(current) === hash(event.event),
      "Calendar changed. Scan before calculating a route.",
    );
    const kind = meetingKind(event.event);
    assert(
      kind !== "virtual" || input.destination,
      "This is a virtual meeting. Select a physical event or an explicit personal destination.",
    );
    const destination =
      input.destination ||
      (!event.unresolved.includes("location")
        ? this.service.config().places[event.event.location || ""]
        : undefined);
    assert(
      destination,
      "Confirm a destination address/place for this trip. An unresolved office name is not a route destination.",
    );
    input.origin = await this.confirmedPlace(input.origin);
    Object.assign(destination, await this.confirmedPlace(destination));
    if (input.stop === "ev")
      assert(
        input.connector && input.dwellMinutes !== undefined,
        "Choose an EV connector and planned charging duration.",
      );
    const buffer =
      input.bufferMinutes ?? this.service.config().preferences.arrivalBuffer;
    const dwell = input.stop
      ? (input.dwellMinutes ??
        { gas: 10, coffee: 10, pharmacy: 15, ev: 30 }[input.stop])
      : 0;
    const target =
      Date.parse(
        eventStart(event.event, this.service.config().preferences.timezone),
      ) -
      buffer * 60000;
    assert(
      target > Date.now(),
      "This meeting is too soon or already past the requested arrival buffer.",
    );
    const initial = new Date(
      Math.max(Date.now() + 60000, target - 60 * 60000),
    ).toISOString();
    if (this.service.providers.mode === "fixture")
      return this.fixture(input, destination, target, dwell, buffer);
    const baseline = await this.route(input.origin, destination, initial);
    const candidates = input.stop
      ? await this.search(baseline.polyline, input.stop, input.connector)
      : [undefined];
    const quotes: TripQuote[] = [];
    for (const candidate of candidates) {
      const stop: PlaceT | undefined = candidate
        ? {
            label: candidate.displayName?.text || "Stop",
            placeId: candidate.id,
            address: candidate.formattedAddress,
            confirmed: true,
          }
        : undefined;
      let departure = Math.max(
        Date.now() + 60000,
        target - (baseline.seconds + dwell * 60) * 1000,
      );
      let total = baseline.seconds;
      let traffic = baseline.traffic;
      let arrival = 0;
      let converged = false;
      for (let iteration = 0; iteration < 3; iteration++) {
        const first = await this.route(
          input.origin,
          stop || destination,
          new Date(departure).toISOString(),
        );
        const second = stop
          ? await this.route(
              stop,
              destination,
              new Date(
                departure + first.seconds * 1000 + dwell * 60000,
              ).toISOString(),
            )
          : undefined;
        total = first.seconds + (second?.seconds || 0);
        traffic = first.traffic && (second?.traffic ?? true);
        arrival = departure + total * 1000 + dwell * 60000;
        const next = Math.max(
          Date.now() + 60000,
          target - total * 1000 - dwell * 60000,
        );
        if (Math.abs(next - departure) < 30000) {
          converged = true;
          break;
        }
        if (iteration < 2) departure = next;
      }
      const comparableBaseline = await this.route(
        input.origin,
        destination,
        new Date(departure).toISOString(),
      );
      const comparison = stopComparison(
        comparableBaseline.seconds,
        total,
        dwell,
        input.maxAddedMinutes,
        arrival,
        target,
      );
      const warnings: string[] = [];
      if (!traffic)
        warnings.push(
          "Traffic estimates are unavailable; routing used a fallback.",
        );
      if (!converged)
        warnings.push(
          "Departure iteration reached its limit. Recheck before leaving.",
        );
      if (candidate && !candidate.currentOpeningHours)
        warnings.push("Stop opening hours are unknown.");
      if (candidate?.currentOpeningHours)
        warnings.push(
          "Opening status is current, not guaranteed for your future visit.",
        );
      if (input.stop === "ev")
        warnings.push(
          "Charging duration is your estimate. Queue time and battery state are unknown.",
        );
      if (!comparison.fits)
        warnings.push(
          "This option exceeds the added-time limit or arrival buffer.",
        );
      const quote: TripQuote = {
        id: id(),
        eventId: event.id,
        eventRevision: event.revision,
        origin: input.origin,
        destination,
        stop,
        category: input.stop,
        dwellMinutes: dwell,
        bufferMinutes: buffer,
        driveSeconds: total,
        addedSeconds: comparison.addedSeconds,
        departureAt: new Date(departure).toISOString(),
        arrivalAt: new Date(arrival).toISOString(),
        calculatedAt: now(),
        trafficAvailable: traffic,
        warnings,
        fits: comparison.fits,
        mode: "live",
        mapsUrl: mapsUrl(input.origin, destination, stop),
        ...(candidate?.evChargeOptions
          ? { availability: candidate.evChargeOptions }
          : {}),
        ...(candidate?.attributions
          ? { attributions: candidate.attributions }
          : {}),
      };
      this.quotes.set(quote.id, { quote, input, expires: Date.now() + 300000 });
      quotes.push(quote);
    }
    this.prune();
    return {
      quotes: quotes.sort((a, b) => a.addedSeconds - b.addedSeconds),
      message: quotes.length
        ? "Google Maps estimates; routes may change."
        : "No suitable stop was found with available hours/connector information.",
      attribution: "Google Maps",
    };
  }
  fixture(
    input: TripRequest,
    destination: PlaceT,
    target: number,
    dwell: number,
    buffer: number,
  ) {
    const event = this.service.currentEvent(input.eventId);
    const drive = 1800;
    const stop = input.stop
      ? {
          label: "Synthetic stop",
          address: "Fixture only",
          confirmed: true as const,
        }
      : undefined;
    const q: TripQuote = {
      id: id(),
      eventId: event.id,
      eventRevision: event.revision,
      origin: input.origin,
      destination,
      stop,
      category: input.stop,
      dwellMinutes: dwell,
      bufferMinutes: buffer,
      driveSeconds: drive,
      addedSeconds: input.stop ? 300 + dwell * 60 : 0,
      departureAt: new Date(
        target - drive * 1000 - dwell * 60000,
      ).toISOString(),
      arrivalAt: new Date(target).toISOString(),
      calculatedAt: now(),
      trafficAvailable: false,
      warnings: [
        "Synthetic fixture duration. No Google Maps request was made.",
      ],
      fits: !input.stop || 300 + dwell * 60 <= input.maxAddedMinutes * 60,
      mode: "fixture",
      mapsUrl: "",
    };
    this.quotes.set(q.id, { quote: q, input, expires: Date.now() + 300000 });
    return {
      quotes: [q],
      message: "Synthetic fixture estimate — not live navigation.",
      attribution: "Fixture",
    };
  }
  prune() {
    for (const [key, value] of this.quotes)
      if (value.expires < Date.now()) this.quotes.delete(key);
  }
  get(quoteId: string) {
    const cached = this.quotes.get(quoteId);
    assert(
      cached && cached.expires > Date.now(),
      "Route quote expired or backend restarted. Calculate a fresh trip.",
    );
    assert(
      cached.quote.eventRevision ===
        this.service.currentEvent(cached.quote.eventId).revision,
      "Meeting changed. Calculate a new trip.",
    );
    return cached;
  }
  async accept(quoteId: string) {
    const cached = this.get(quoteId);
    const q = cached.quote;
    assert(
      q.fits,
      "This route does not meet the selected timing limits. Review another option.",
    );
    const e = this.service.currentEvent(q.eventId);
    const fresh = await this.service.providers.calendarGet(
      e.calendarId,
      e.event.id,
    );
    assert(
      hash(fresh) === hash(e.event),
      "Calendar changed since route calculation. Scan and recalculate.",
    );
    // No raw Google response, route geometry, hours or availability is archived.
    this.service.store.put("trip", q.id, {
      id: q.id,
      eventId: q.eventId,
      eventRevision: q.eventRevision,
      origin: q.origin.placeId
        ? {
            label: "Confirmed origin",
            placeId: q.origin.placeId,
            confirmed: true,
          }
        : q.origin,
      personalDestination: !!cached.input.destination,
      destination: q.destination.placeId
        ? {
            label: e.event.location || "Confirmed destination",
            placeId: q.destination.placeId,
            confirmed: true,
          }
        : cached.input.destination ||
          this.service.config().places[e.event.location || ""],
      stopPlaceId: q.stop?.placeId,
      category: q.category,
      dwellMinutes: q.dwellMinutes,
      bufferMinutes: q.bufferMinutes,
      maxAddedMinutes: cached.input.maxAddedMinutes,
      connector: cached.input.connector,
      acceptedDepartureAt: q.departureAt,
      acceptedAt: now(),
      state: "accepted",
    });
    return q;
  }
  async departure(quoteId: string, eventId: string) {
    const q = this.get(quoteId).quote;
    assert(q.eventId === eventId, "Trip is for another event.");
    assert(
      this.service.store.get("trip", quoteId),
      "Accept the trip before scheduling departure.",
    );
    return q.departureAt;
  }
  async refreshAccepted(tripId: string) {
    const trip = this.service.store.get("trip", tripId);
    assert(trip, "Accepted trip not found.");
    const event = this.service.currentEvent(trip.eventId);
    assert(
      !event.unresolved.length,
      "Meeting facts must be resolved before trip refresh.",
    );
    assert(
      eligible(event.event),
      "Canceled or declined meetings cannot refresh departure.",
    );
    if (trip.eventRevision !== event.revision) {
      if (!trip.personalDestination) {
        const destination =
          this.service.config().places[event.event.location || ""];
        assert(
          destination,
          "Confirm the revised meeting address before departure can be updated.",
        );
        trip.destination = await this.confirmedPlace({ ...destination });
      }
      trip.eventRevision = event.revision;
    }
    const target =
      Date.parse(
        eventStart(event.event, this.service.config().preferences.timezone),
      ) -
      trip.bufferMinutes * 60000;
    const stop: PlaceT | undefined = trip.stopPlaceId
      ? {
          label: "Previously selected stop",
          placeId: trip.stopPlaceId,
          confirmed: true,
        }
      : undefined;
    if (this.service.providers.mode === "fixture") {
      const old = this.quotes.get(tripId);
      assert(old, "Recalculate the fixture trip after restart.");
      old.expires = Date.now() + 300000;
      return old.quote;
    }
    let departure = Math.max(
      Date.now() + 60000,
      Date.parse(trip.acceptedDepartureAt),
    );
    let duration = 0,
      arrival = 0,
      traffic = true;
    for (let i = 0; i < 3; i++) {
      const first = await this.route(
        trip.origin,
        stop || trip.destination,
        new Date(departure).toISOString(),
      );
      const second = stop
        ? await this.route(
            stop,
            trip.destination,
            new Date(
              departure + first.seconds * 1000 + trip.dwellMinutes * 60000,
            ).toISOString(),
          )
        : undefined;
      duration = first.seconds + (second?.seconds || 0);
      traffic = first.traffic && (second?.traffic ?? true);
      arrival = departure + duration * 1000 + trip.dwellMinutes * 60000;
      const next = Math.max(
        Date.now() + 60000,
        target - duration * 1000 - trip.dwellMinutes * 60000,
      );
      if (Math.abs(next - departure) < 30000) break;
      if (i < 2) departure = next;
    }
    const baseline = await this.route(
      trip.origin,
      trip.destination,
      new Date(departure).toISOString(),
    );
    const comparison = stopComparison(
      baseline.seconds,
      duration,
      trip.dwellMinutes,
      trip.maxAddedMinutes || 30,
      arrival,
      target,
    );
    const q: TripQuote = {
      id: tripId,
      eventId: event.id,
      eventRevision: event.revision,
      origin: trip.origin,
      destination: trip.destination,
      stop,
      category: trip.category,
      dwellMinutes: trip.dwellMinutes,
      bufferMinutes: trip.bufferMinutes,
      driveSeconds: duration,
      addedSeconds: comparison.addedSeconds,
      departureAt: new Date(departure).toISOString(),
      arrivalAt: new Date(arrival).toISOString(),
      calculatedAt: now(),
      trafficAvailable: traffic,
      warnings: [
        "Refreshed timing for the same selected stop. Stop hours and availability may have changed.",
      ],
      fits: comparison.fits,
      mode: "live",
      mapsUrl: mapsUrl(trip.origin, trip.destination, stop),
    };
    this.quotes.set(tripId, {
      quote: q,
      input: {
        eventId: event.id,
        origin: trip.origin,
        destination: trip.destination,
        stop: trip.category,
        dwellMinutes: trip.dwellMinutes,
        bufferMinutes: trip.bufferMinutes,
        maxAddedMinutes: trip.maxAddedMinutes || 30,
      },
      expires: Date.now() + 300000,
    });
    this.service.store.put("trip", tripId, {
      ...trip,
      destination: trip.destination.placeId
        ? {
            label: "Confirmed destination",
            placeId: trip.destination.placeId,
            confirmed: true,
          }
        : trip.destination,
      acceptedDepartureAt: q.departureAt,
      state: q.fits ? "accepted" : "attention",
      refreshedAt: now(),
    });
    return q;
  }
  invalidate(eventId: string) {
    for (const [key, value] of this.quotes)
      if (
        value.quote.eventId === eventId &&
        value.quote.eventRevision !==
          this.service.currentEvent(eventId).revision
      )
        this.quotes.delete(key);
    for (const trip of this.service.store
      .all("trip")
      .filter(
        (t) =>
          t.eventId === eventId &&
          t.eventRevision !== this.service.currentEvent(eventId).revision,
      ))
      this.service.store.put("trip", trip.id, { ...trip, state: "stale" });
  }
}
