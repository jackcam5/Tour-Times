#!/usr/bin/env ruby
# frozen_string_literal: true

require "webrick"
require "json"
require "net/http"
require "uri"
require "zlib"
require "stringio"
require "csv"
require "time"
require "fileutils"
require "digest"
require "erb"
require "base64"
require "webrick/cookie"

ROOT = File.expand_path(__dir__)
CACHE_DIR = ENV.fetch("CACHE_DIR", File.join(ROOT, ".cache"))
DATA_DIR = ENV.fetch("DATA_DIR", File.join(ROOT, ".data"))
STATIONS_CACHE = File.join(CACHE_DIR, "stations.cache.json.gz")
STATIONS_URL = "https://aviationweather.gov/data/cache/stations.cache.json.gz"
SHARED_CONFIG_PATH = File.join(DATA_DIR, "shared-config.json")
SHARED_CSV_PATH = File.join(DATA_DIR, "shared.csv")
SHARED_FLIGHT_ANNOTATIONS_PATH = File.join(DATA_DIR, "shared-flight-annotations.json")
USER_AGENT = "MyTourTimes/0.1"
MAX_HISTORY_AGE = 7 * 24 * 60 * 60
DEFAULT_ADMIN_PASSWORD = ENV.fetch("MYTOURTIMES_ADMIN_PASSWORD", "spider123")
ADMIN_COOKIE_NAME = "mytourtimes_admin"
INDEX_PATH = File.join(ROOT, "index.html")
BIND_ADDRESS = ENV.fetch("HOST", "0.0.0.0")
LOGO_FILE_PATH = File.join(ROOT, "assets", "mytourtimes-logo.png")
LOGO_VERSION = "20260414-routefix24"
EMBEDDED_LOGO_BASE64 = <<~BASE64.delete("\n")
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ggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgIIEBIB0BAQAAACAggQEgHQEBAAAAICCBASAdAQEAAAAgILe/2M6Qz6D5YQAAAABJRU5ErkJggg==
BASE64

FileUtils.mkdir_p(CACHE_DIR)
FileUtils.mkdir_p(DATA_DIR)

module WeatherHelpers
  module_function

  def json_response(res, payload, status: 200)
    res.status = status
    res["Content-Type"] = "application/json; charset=utf-8"
    res["Access-Control-Allow-Origin"] = "*"
    res.body = JSON.generate(payload)
  end

  def parse_json_body(req)
    body = req.body.to_s
    return {} if body.strip.empty?

    JSON.parse(body)
  end

  def read_shared_config
    return nil unless File.exist?(SHARED_CONFIG_PATH)

    JSON.parse(File.read(SHARED_CONFIG_PATH))
  rescue JSON::ParserError
    nil
  end

  def read_shared_csv
    return "" unless File.exist?(SHARED_CSV_PATH)

    File.read(SHARED_CSV_PATH)
  end

  def read_shared_flight_annotations
    return {} unless File.exist?(SHARED_FLIGHT_ANNOTATIONS_PATH)

    parsed = JSON.parse(File.read(SHARED_FLIGHT_ANNOTATIONS_PATH))
    parsed.is_a?(Hash) ? parsed : {}
  rescue JSON::ParserError
    {}
  end

  def public_config(config)
    return nil unless config.is_a?(Hash)

    sanitized = JSON.parse(JSON.generate(config))
    sanitized.delete("adminPassword")
    sanitized
  end

  def write_shared_config(config)
    incoming = config.is_a?(Hash) ? JSON.parse(JSON.generate(config)) : {}
    existing = read_shared_config
    if incoming["adminPassword"].to_s.strip.empty? && existing.is_a?(Hash)
      existing_password = existing["adminPassword"].to_s.strip
      incoming["adminPassword"] = existing_password unless existing_password.empty?
    end
    File.write(SHARED_CONFIG_PATH, JSON.pretty_generate(incoming))
  end

  def write_shared_csv(csv_text)
    File.write(SHARED_CSV_PATH, csv_text.to_s)
  end

  def write_shared_flight_annotations(annotations)
    File.write(
      SHARED_FLIGHT_ANNOTATIONS_PATH,
      JSON.pretty_generate(annotations.is_a?(Hash) ? annotations : {})
    )
  end

  def clear_shared_state
    File.delete(SHARED_CONFIG_PATH) if File.exist?(SHARED_CONFIG_PATH)
    File.delete(SHARED_CSV_PATH) if File.exist?(SHARED_CSV_PATH)
    File.delete(SHARED_FLIGHT_ANNOTATIONS_PATH) if File.exist?(SHARED_FLIGHT_ANNOTATIONS_PATH)
  end

  def shared_admin_password
    config = read_shared_config
    password = config.is_a?(Hash) ? config["adminPassword"] : nil
    text = password.to_s.strip
    text.empty? ? DEFAULT_ADMIN_PASSWORD : text
  end

  def admin_cookie_value
    Digest::SHA256.hexdigest("mytourtimes-admin|#{shared_admin_password}|#{ROOT}")
  end

  def authenticated_admin_session?(req)
    cookie = Array(req.cookies).find { |item| item.name == ADMIN_COOKIE_NAME }
    cookie && cookie.value == admin_cookie_value
  end

  def authorized_admin?(req, payload = {})
    return true if authenticated_admin_session?(req)

    provided = []
    provided << req["X-Admin-Password"]
    provided << payload["adminPassword"] if payload.is_a?(Hash)
    normalized = provided.compact.map { |item| item.to_s.strip }.reject(&:empty?)
    normalized.include?(shared_admin_password)
  end

  def shared_state_payload
    config = read_shared_config
    csv_text = read_shared_csv
    flight_annotations = read_shared_flight_annotations
    timestamps = [SHARED_CONFIG_PATH, SHARED_CSV_PATH, SHARED_FLIGHT_ANNOTATIONS_PATH]
      .select { |path| File.exist?(path) }
      .map { |path| File.mtime(path).utc.iso8601 }

    {
      config: public_config(config),
      csvText: csv_text,
      flightAnnotations: flight_annotations,
      hasConfig: !config.nil?,
      hasCsv: !csv_text.to_s.strip.empty?,
      publishedAt: timestamps.max
    }
  end

  def logo_binary
    @logo_binary ||= begin
      if File.exist?(LOGO_FILE_PATH)
        File.binread(LOGO_FILE_PATH)
      else
        Base64.decode64(EMBEDDED_LOGO_BASE64)
      end
    end
  end

  def admin_login_page(error_message = nil)
    error_markup =
      if error_message.to_s.strip.empty?
        ""
      else
        "<p class=\"login-error\">#{ERB::Util.html_escape(error_message)}</p>"
      end

    <<~HTML
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
          <meta http-equiv="Pragma" content="no-cache" />
          <meta http-equiv="Expires" content="0" />
          <title>MyTourTimes Admin Login</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800&display=swap"
          />
          <style>
            :root {
              color-scheme: dark;
              --bg: #101722;
              --panel: #1f2b3d;
              --panel-line: rgba(255, 255, 255, 0.08);
              --ink: #f4f7fb;
              --muted: #a9b4c6;
              --field: #2f6fa4;
              --field-line: #5ca0ea;
              --button: #67a6f7;
              --button-ink: #0d1624;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              background: linear-gradient(180deg, #101722 0%, #0c121b 100%);
              color: var(--ink);
              font-family: "Montserrat", "Avenir Next", "Segoe UI", sans-serif;
            }
            .login-shell {
              width: min(100%, 620px);
              padding: 36px 36px 28px;
              border-radius: 24px;
              background: var(--panel);
              border: 1px solid var(--panel-line);
              box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);
            }
            .brand-lockup {
              display: flex;
              align-items: center;
              gap: 22px;
              margin-bottom: 34px;
            }
            .brand-mark {
              display: block;
              width: min(240px, 42vw);
              color: #f7f9fc;
              flex: 0 0 auto;
            }
            .brand-mark svg {
              display: block;
              width: 100%;
              height: auto;
              filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.2));
            }
            .brand-wordmark {
              display: grid;
              gap: 6px;
            }
            .brand-wordmark__eyebrow,
            .brand-wordmark__subhead {
              margin: 0;
              color: var(--muted);
              text-transform: uppercase;
            }
            .brand-wordmark__eyebrow {
              font-size: 0.76rem;
              letter-spacing: 0.3em;
              font-weight: 700;
            }
            .brand-wordmark h1 {
              margin: 0;
              display: grid;
              gap: 0.02em;
              font-size: clamp(2rem, 5vw, 3.2rem);
              line-height: 0.88;
              letter-spacing: -0.045em;
              text-transform: uppercase;
              font-weight: 800;
              font-style: italic;
              text-shadow: 0 10px 18px rgba(0, 0, 0, 0.18);
            }
            .brand-wordmark h1 span {
              display: block;
            }
            .brand-wordmark__subhead {
              letter-spacing: 0.28em;
              font-size: 0.76rem;
              font-weight: 600;
            }
            h2 {
              margin: 0 0 22px;
              font-size: 3rem;
              line-height: 1;
              letter-spacing: -0.05em;
            }
            label {
              display: grid;
              gap: 8px;
              margin-bottom: 18px;
              color: var(--muted);
              font-size: 0.92rem;
            }
            input[type="password"] {
              width: 100%;
              border-radius: 16px;
              border: 1px solid var(--field-line);
              background: var(--field);
              color: var(--ink);
              font: inherit;
              font-family: "Montserrat", "Avenir Next", "Segoe UI", sans-serif;
              padding: 16px 18px;
              box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
            }
            button {
              width: 100%;
              border: 0;
              border-radius: 16px;
              padding: 16px 18px;
              font: inherit;
              font-weight: 800;
              background: var(--button);
              color: var(--button-ink);
              cursor: pointer;
            }
            .login-note {
              margin: 18px 0 0;
              color: var(--muted);
              line-height: 1.5;
            }
            .login-error {
              margin: -6px 0 18px;
              color: #ffb3aa;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <main class="login-shell">
            <div class="brand-lockup">
              <div class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 260 96" role="presentation" focusable="false">
                  <polygon points="12,14 202,14 222,32 46,32" fill="currentColor"></polygon>
                  <polygon points="12,30 154,30 168,48 12,48" fill="currentColor"></polygon>
                  <polygon points="12,46 176,46 192,64 12,64" fill="currentColor"></polygon>
                  <polygon points="130,56 214,56 230,74 146,74" fill="currentColor" opacity="0.96"></polygon>
                </svg>
              </div>
              <div class="brand-wordmark">
                <p class="brand-wordmark__eyebrow">MyFlight</p>
                <h1><span>Tour</span><span>Times</span></h1>
                <p class="brand-wordmark__subhead">Secure admin</p>
              </div>
            </div>
            <h2>Sign in</h2>
            #{error_markup}
            <form method="post" action="/admin/login">
              <label>
                Password
                <input type="password" name="password" placeholder="Enter admin password" required />
              </label>
              <button type="submit">Sign in</button>
            </form>
            <p class="login-note">This protected admin page is separate from the pilot viewer link.</p>
          </main>
        </body>
      </html>
    HTML
  end

  def serve_app_shell(res)
    res.status = 200
    res["Content-Type"] = "text/html; charset=utf-8"
    res.body = File.read(INDEX_PATH)
  end

  def haversine_km(lat1, lon1, lat2, lon2)
    rad = Math::PI / 180.0
    dlat = (lat2 - lat1) * rad
    dlon = (lon2 - lon1) * rad
    lat1r = lat1 * rad
    lat2r = lat2 * rad
    a = Math.sin(dlat / 2)**2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dlon / 2)**2
    6371.0 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  end

  def fetch_uri(uri_string)
    uri = URI(uri_string)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = 4
    http.read_timeout = 4
    http.write_timeout = 4 if http.respond_to?(:write_timeout=)
    request = Net::HTTP::Get.new(uri)
    request["User-Agent"] = USER_AGENT
    response = http.request(request)
    unless response.is_a?(Net::HTTPSuccess)
      raise "HTTP #{response.code} from #{uri}"
    end
    response.body
  end

  def read_gzip_string(binary)
    gz = Zlib::GzipReader.new(StringIO.new(binary))
    gz.read
  ensure
    gz&.close
  end

  def ensure_station_cache
    fresh = File.exist?(STATIONS_CACHE) && (Time.now - File.mtime(STATIONS_CACHE) < 24 * 60 * 60)
    return if fresh

    body = fetch_uri(STATIONS_URL)
    File.binwrite(STATIONS_CACHE, body)
  end

  def station_records
    ensure_station_cache
    body = read_gzip_string(File.binread(STATIONS_CACHE))
    parsed = JSON.parse(body)
    features =
      if parsed.is_a?(Hash) && parsed["features"].is_a?(Array)
        parsed["features"]
      elsif parsed.is_a?(Array)
        parsed
      else
        []
      end

    features.filter_map do |feature|
      props = feature["properties"] || feature
      coords = feature.dig("geometry", "coordinates")
      lon = coords.is_a?(Array) ? coords[0] : props["lon"] || props["longitude"]
      lat = coords.is_a?(Array) ? coords[1] : props["lat"] || props["latitude"]
      id = props["icaoId"] || props["icao"] || props["ident"] || props["station_id"] || props["id"]
      next unless id && lat && lon

      {
        "id" => id,
        "name" => props["name"] || props["site"] || id,
        "lat" => lat.to_f,
        "lon" => lon.to_f
      }
    end
  end

  def nearest_stations(lat, lon, limit = 8)
    station_records
      .map do |station|
        station.merge("distanceKm" => haversine_km(lat, lon, station["lat"], station["lon"]))
      end
      .sort_by { |station| station["distanceKm"] }
      .first(limit)
  end

  def preferred_stations(ids, lat, lon)
    by_id = station_records.each_with_object({}) do |station, memo|
      memo[station["id"].to_s.upcase] = station
    end

    ids.filter_map.with_index do |station_id, index|
      normalized = station_id.to_s.strip.upcase
      next if normalized.empty?

      station = by_id[normalized]
      if station
        station.merge(
          "distanceKm" => haversine_km(lat, lon, station["lat"], station["lon"]),
          "priority" => index
        )
      else
        {
          "id" => normalized,
          "name" => normalized,
          "lat" => lat,
          "lon" => lon,
          "distanceKm" => nil,
          "priority" => index
        }
      end
    end
  end

  def metar_dataserver_url(ids, start_time, end_time)
    query = URI.encode_www_form(
      dataSource: "metars",
      requestType: "retrieve",
      format: "csv",
      stationString: ids.join(","),
      startTime: start_time.utc.iso8601,
      endTime: end_time.utc.iso8601
    )
    "https://aviationweather.gov/api/data/dataserver?#{query}"
  end

  def parse_dataserver_csv(text)
    lines = text.lines.reject { |line| line.strip.empty? || line.start_with?("#") }
    return [] if lines.empty?

    CSV.parse(lines.join, headers: true).map(&:to_h)
  end

  def metar_time(record)
    raw =
      record["observation_time"] ||
      record["obsTime"] ||
      record["issue_time"] ||
      record["valid_time"] ||
      record["date_time"]
    raw ? Time.parse(raw) : nil
  rescue ArgumentError
    nil
  end

  def record_station_id(record)
    record["station_id"] || record["icaoId"] || record["icao"] || record["id"]
  end

  def record_ceiling(record)
    candidates = []
    record.each do |key, value|
      next unless key.to_s.include?("cloud_base") || key.to_s.include?("ceiling")
      numeric = value.to_f
      candidates << numeric if numeric.positive?
    end
    candidates.min
  end

  def simplify_metar(record, station_lookup, requested_time)
    station_id = record_station_id(record)
    time = metar_time(record)
    station = station_lookup[station_id]

    {
      "stationId" => station_id,
      "stationName" => station && station["name"],
      "distanceKm" => station && station["distanceKm"],
      "observedAt" => time&.utc&.iso8601,
      "minutesFromFlight" => time ? (((time - requested_time) / 60.0).round) : nil,
      "rawText" => record["raw_text"] || record["rawOb"] || "",
      "flightCategory" => record["flight_category"] || record["fltCat"],
      "windDirDegrees" => record["wind_dir_degrees"] || record["wdir"],
      "windSpeedKt" => record["wind_speed_kt"] || record["wspd"],
      "windGustKt" => record["wind_gust_kt"] || record["wgst"],
      "visibilityMiles" => record["visibility_statute_mi"] || record["visib"],
      "ceilingFtAgl" => record_ceiling(record),
      "altimeterHg" => record["altim_in_hg"] || record["altim"],
      "temperatureC" => record["temp_c"] || record["temp"],
      "dewpointC" => record["dewpoint_c"] || record["dewp"],
      "weatherString" => record["wx_string"] || record["wxString"]
    }
  end
end

class SharedStateServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_OPTIONS(_req, res)
    res.status = 204
    res["Access-Control-Allow-Origin"] = "*"
    res["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    res["Access-Control-Allow-Headers"] = "Content-Type, X-Admin-Password"
  end

  def do_GET(_req, res)
    WeatherHelpers.json_response(res, WeatherHelpers.shared_state_payload)
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end

  def do_POST(req, res)
    payload = WeatherHelpers.parse_json_body(req)
    unless WeatherHelpers.authorized_admin?(req, payload)
      WeatherHelpers.json_response(res, { error: "Admin password is incorrect." }, status: 403)
      return
    end

    if payload.key?("config") && payload["config"].is_a?(Hash)
      WeatherHelpers.write_shared_config(payload["config"])
    end

    if payload.key?("csvText")
      WeatherHelpers.write_shared_csv(payload["csvText"].to_s)
    end

    if payload.key?("flightAnnotations")
      WeatherHelpers.write_shared_flight_annotations(payload["flightAnnotations"])
    end

    WeatherHelpers.json_response(
      res,
      WeatherHelpers.shared_state_payload.merge(message: "Weekly view published.")
    )
  rescue JSON::ParserError
    WeatherHelpers.json_response(res, { error: "Payload JSON is invalid." }, status: 400)
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end

  def do_DELETE(req, res)
    unless WeatherHelpers.authorized_admin?(req)
      WeatherHelpers.json_response(res, { error: "Admin password is incorrect." }, status: 403)
      return
    end

    WeatherHelpers.clear_shared_state
    WeatherHelpers.json_response(
      res,
      {
        config: nil,
        csvText: "",
        flightAnnotations: {},
        hasConfig: false,
        hasCsv: false,
        publishedAt: nil,
        message: "Published weekly view cleared."
      }
    )
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end
end

class AdminServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(req, res)
    if WeatherHelpers.authenticated_admin_session?(req)
      WeatherHelpers.serve_app_shell(res)
      return
    end

    res.status = 200
    res["Content-Type"] = "text/html; charset=utf-8"
    res.body = WeatherHelpers.admin_login_page
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end
end

class AdminLoginServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_POST(req, res)
    password = req.query["password"].to_s.strip
    unless password == WeatherHelpers.shared_admin_password
      res.status = 401
      res["Content-Type"] = "text/html; charset=utf-8"
      res.body = WeatherHelpers.admin_login_page("Admin password is incorrect.")
      return
    end

    cookie = WEBrick::Cookie.new(ADMIN_COOKIE_NAME, WeatherHelpers.admin_cookie_value)
    cookie.path = "/"
    cookie.expires = Time.now + (60 * 60 * 12)
    cookie.instance_variable_set(:@httponly, true)
    res.cookies << cookie
    res.status = 303
    res["Location"] = "/admin"
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end
end

class AdminLogoutServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(_req, res)
    cookie = WEBrick::Cookie.new(ADMIN_COOKIE_NAME, "")
    cookie.path = "/"
    cookie.expires = Time.at(0)
    cookie.instance_variable_set(:@httponly, true)
    res.cookies << cookie
    res.status = 303
    res["Location"] = "/"
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end
end

class WeatherServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_OPTIONS(req, res)
    res.status = 204
    res["Access-Control-Allow-Origin"] = "*"
    res["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    res["Access-Control-Allow-Headers"] = "Content-Type"
  end

  def do_GET(req, res)
    lat = Float(req.query["lat"])
    lon = Float(req.query["lon"])
    requested_time = Time.parse(req.query["time"]).utc
    preferred_station_ids = req.query["stations"].to_s.split(/[,\s]+/).map(&:strip).reject(&:empty?).uniq

    if requested_time < Time.now.utc - MAX_HISTORY_AGE
      WeatherHelpers.json_response(
        res,
        {
          requestedAt: requested_time.iso8601,
          nearbyStations: [],
          outsideRange: true,
          metar: nil
        }
      )
      return
    end

    preferred_stations = WeatherHelpers.preferred_stations(preferred_station_ids, lat, lon)
    stations = (preferred_stations + WeatherHelpers.nearest_stations(lat, lon, 8))
      .uniq { |station| station["id"] }
      .first(8)
    if stations.empty?
      WeatherHelpers.json_response(res, { error: "No nearby weather stations found" }, status: 404)
      return
    end

    station_lookup = stations.each_with_object({}) { |station, memo| memo[station["id"]] = station }
    start_time = requested_time - (2 * 60 * 60)
    end_time = requested_time + (2 * 60 * 60)
    url = WeatherHelpers.metar_dataserver_url(stations.map { |station| station["id"] }, start_time, end_time)
    rows = WeatherHelpers.parse_dataserver_csv(WeatherHelpers.fetch_uri(url))

    if rows.empty?
      WeatherHelpers.json_response(
        res,
        {
          requestedAt: requested_time.utc.iso8601,
          nearbyStations: stations,
          metar: nil
        }
      )
      return
    end

    metar =
      rows
        .map { |row| WeatherHelpers.simplify_metar(row, station_lookup, requested_time) }
        .compact
        .sort_by do |row|
          station = station_lookup[row["stationId"]]
          [
            station && !station["priority"].nil? ? 0 : 1,
            station && !station["priority"].nil? ? station["priority"] : 999,
            row["minutesFromFlight"] ? row["minutesFromFlight"].abs : 9_999,
            station && station["distanceKm"] ? station["distanceKm"] : 9_999
          ]
        end
        .first

    WeatherHelpers.json_response(
      res,
      {
        requestedAt: requested_time.utc.iso8601,
        nearbyStations: stations,
        metar: metar
      }
    )
  rescue StandardError => e
    WeatherHelpers.json_response(res, { error: e.message }, status: 500)
  end

  private
end

class LogoServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(_req, res)
    res.status = 200
    res["Content-Type"] = "image/png"
    res["Cache-Control"] = "public, max-age=31536000, immutable"
    res.body = WeatherHelpers.logo_binary
  end
end

class HealthServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(_req, res)
    WeatherHelpers.json_response(
      res,
      {
        ok: true,
        app: "mytourtimes",
        time: Time.now.utc.iso8601
      }
    )
  rescue StandardError => e
    WeatherHelpers.json_response(res, { ok: false, error: e.message }, status: 500)
  end
end

server = WEBrick::HTTPServer.new(
  Port: Integer(ENV.fetch("PORT", "8000")),
  DocumentRoot: ROOT,
  BindAddress: BIND_ADDRESS,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::WARN),
  RequestCallback: proc do |_req, res|
    res["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    res["Pragma"] = "no-cache"
    res["Expires"] = "0"
  end
)

server.mount "/health", HealthServlet
server.mount "/mytourtimes-logo.png", LogoServlet
server.mount "/api/weather", WeatherServlet
server.mount "/api/shared-state", SharedStateServlet
server.mount "/admin/login", AdminLoginServlet
server.mount "/admin/logout", AdminLogoutServlet
server.mount "/admin", AdminServlet
trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

puts "MyTourTimes server running at http://#{BIND_ADDRESS}:#{server.config[:Port]}"
server.start
