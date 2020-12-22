create schema if not exists podcastindex;

create table if not exists podcastindex.feed(
    id bigserial primary key,
    url varchar(256) not null,

    constraint feed_uq unique (url)
);

create table if not exists podcastindex.channel(
    id bigserial primary key,
    feed_id bigint not null,
    title varchar(1024) not null,

    constraint feed_fk
        foreign key (feed_id)
        references podcastindex.feed (id)
        on delete cascade
);

create table if not exists podcastindex.episode(
    id bigserial primary key,
    channel_id bigint not null,
    title varchar(1024) not null,

    constraint channel_fk
        foreign key (channel_id)
        references podcastindex.channel (id)
        on delete cascade
);

create table if not exists podcastindex.feed_reading_result(
    id bigserial primary key,
    feed_id bigint not null,
    content_key varchar(256) null,
    successful boolean not null,
    message varchar(1024) null,

    constraint feed_reading_result_uq unique (feed_id),

    constraint feed_fk
        foreign key (feed_id)
        references podcastindex.feed (id)
        on delete cascade
);
