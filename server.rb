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
            .brand-logo {
              display: block;
              width: min(250px, 48vw);
              max-width: 100%;
              height: auto;
              flex: 0 0 auto;
              object-fit: contain;
              filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.2));
            }
            .brand-wordmark {
              display: grid;
              gap: 4px;
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
              font-size: clamp(2.3rem, 5.5vw, 3.6rem);
              line-height: 0.94;
              letter-spacing: -0.05em;
              text-transform: uppercase;
              font-weight: 800;
              font-style: italic;
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
              <img src="/assets/mytourtimes-logo.png" alt="MyTourTimes" class="brand-logo" />
              <div class="brand-wordmark">
                <p class="brand-wordmark__eyebrow">MyFlight</p>
                <h1>Tour Times</h1>
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
      json_response(
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
      json_response(res, { error: "No nearby weather stations found" }, status: 404)
      return
    end

    station_lookup = stations.each_with_object({}) { |station, memo| memo[station["id"]] = station }
    start_time = requested_time - (2 * 60 * 60)
    end_time = requested_time + (2 * 60 * 60)
    url = WeatherHelpers.metar_dataserver_url(stations.map { |station| station["id"] }, start_time, end_time)
    rows = WeatherHelpers.parse_dataserver_csv(WeatherHelpers.fetch_uri(url))

    if rows.empty?
      json_response(
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

    json_response(
      res,
      {
        requestedAt: requested_time.utc.iso8601,
        nearbyStations: stations,
        metar: metar
      }
    )
  rescue StandardError => e
    json_response(res, { error: e.message }, status: 500)
  end

  private
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
server.mount "/api/weather", WeatherServlet
server.mount "/api/shared-state", SharedStateServlet
server.mount "/admin/login", AdminLoginServlet
server.mount "/admin/logout", AdminLogoutServlet
server.mount "/admin", AdminServlet
trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

puts "MyTourTimes server running at http://#{BIND_ADDRESS}:#{server.config[:Port]}"
server.start
