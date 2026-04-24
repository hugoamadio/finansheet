# syntax=docker/dockerfile:1
# check=error=true

# Dockerfile com dois targets: development e production.
#
# Development (com hot reload — monte o código como volume em runtime):
#   docker build --target development -t finansheet-dev .
#   docker run --rm -p 3000:3000 --env-file .env \
#     -v "$(pwd):/rails" -v finansheet_bundle:/usr/local/bundle finansheet-dev
#
# Production (target default do `docker build .`):
#   docker build -t finansheet .
#   docker run -d -p 80:80 -e RAILS_MASTER_KEY=<value from config/master.key> --name finansheet finansheet

ARG RUBY_VERSION=3.3.6


# ============================================================
# Development — hot reload via volume montado em runtime
# ============================================================
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS development

WORKDIR /rails

# Runtime + build deps (dev também compila gems interativamente)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl libjemalloc2 libvips libpq5 \
      build-essential git libyaml-dev libpq-dev pkg-config && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV BUNDLE_PATH="/usr/local/bundle" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so" \
    RAILS_ENV="development"

# Instala TODOS os gems (inclui grupos :development e :test)
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copia o código pra imagem bootar mesmo sem volume.
# Em runtime você monta `.:/rails` sobrescrevendo esse snapshot —
# é isso que habilita hot reload (Rails watcha via listen/inotify).
COPY . .

EXPOSE 3000
CMD ["./bin/rails", "server", "-b", "0.0.0.0", "-p", "3000"]


# ============================================================
# Production — imagem enxuta, só o que roda em runtime
# ============================================================
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS production

WORKDIR /rails

# Deps de RUNTIME apenas. libyaml-0-2 explícito pra não ser auto-removido
# quando purgarmos libyaml-dev depois.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl libjemalloc2 libvips libpq5 libyaml-0-2 && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV BUNDLE_PATH="/usr/local/bundle" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so" \
    RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_WITHOUT="development:test"

COPY vendor/* ./vendor/
COPY Gemfile Gemfile.lock ./

# Instala build deps, compila gems, PURGA build deps — tudo numa layer só.
# Purgar numa layer posterior não reduziria a imagem final (layers são aditivas);
# fazer no mesmo RUN faz o diff da layer conter só o net (gems instalados).
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential git libyaml-dev libpq-dev pkg-config && \
    bundle install && \
    rm -rf ~/.bundle/ \
           "${BUNDLE_PATH}"/ruby/*/cache \
           "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile && \
    apt-get purge -y --auto-remove build-essential git libyaml-dev libpq-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives /tmp/* /var/tmp/*

# Copia o código (depois de instalar gems pra aproveitar cache de layer
# quando só o código muda).
COPY . .

# Precompila bootsnap do app + assets. Não precisa de build-essential
# (importmap + propshaft não compilam JS/CSS, só copiam).
RUN bundle exec bootsnap precompile -j 1 app/ lib/ && \
    SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# Usuário não-root pra runtime
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails /rails "${BUNDLE_PATH}"
USER 1000:1000

# Entrypoint prepara o banco na primeira subida
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Thruster (HTTP/2 proxy + cache de assets + X-Sendfile) na frente do Puma
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
