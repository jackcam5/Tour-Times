FROM ruby:3.3-slim

WORKDIR /app

RUN gem install --no-document webrick

COPY . /app

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV CACHE_DIR=/tmp/mytourtimes-cache

EXPOSE 8080

CMD ["ruby", "server.rb"]
