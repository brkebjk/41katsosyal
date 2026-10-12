"""Overture 'places' verisinden Kocaeli yer listesini (places_kocaeli.csv) hazırlar.

Girdi : kc_places.parquet (Overture yerleri, Kocaeli çevresi) ve da_kocaeli.parquet (ilçe sınırları)
Çıktı : supabase/places_kocaeli.csv
Hassas yerler (ibadethane, sağlık, okul/kreş, siyasi/sendika, emniyet/cezaevi...) ve işletmeler arası
(B2B) kayıtlar listeye ALINMAZ: üye bu yerleri akışta etiketleyip kendisi hakkında hassas bilgi vermesin.
"""
import csv, re, sys
import duckdb, numpy as np, shapely
from shapely import wkt, STRtree
from hexgrid import cell_of

SIZE = 500.0
SRC = sys.argv[1] if len(sys.argv) > 1 else 'kc_places.parquet'
DIV = sys.argv[2] if len(sys.argv) > 2 else 'da_kocaeli.parquet'
OUT = sys.argv[3] if len(sys.argv) > 3 else 'places_kocaeli.csv'

FOLD_FROM = 'ıüşöçğâîûİ'
FOLD_TO = 'iusocgaiui'


def fold(s: str) -> str:
    s = s.replace('İ', 'i').replace('I', 'ı').lower()
    s = ''.join(FOLD_TO[FOLD_FROM.index(c)] if c in FOLD_FROM else c for c in s)
    return re.sub(r'\s+', ' ', s).strip()


def tr_lower(s):
    return s.replace('İ', 'i').replace('I', 'ı').lower()


def tr_title(s):
    out = []
    for w in s.split(' '):
        if not w:
            continue
        lw = tr_lower(w)
        first = lw[0]
        first = 'İ' if first == 'i' else ('I' if first == 'ı' else first.upper())
        out.append(first + lw[1:])
    return ' '.join(out)


def tidy(s: str) -> str:
    s = re.sub(r'\s+', ' ', s).strip()
    letters = [c for c in s if c.isalpha()]
    if letters and len(letters) > 3 and (s == s.upper() or s == tr_lower(s)):
        s = tr_title(s)
    return s


# --- Dışarıda bırakılan kategoriler -------------------------------------------------------------
EXCLUDE_EXACT = set('''
atm package_locker real_estate_service real_estate_agent real_estate_investment commercial_real_estate
property_management home_developer condominium building_or_construction_service contractor professional_service
advertising_agency printing_service storage_facility freight_and_cargo_service commercial_industrial
industrial_company industrial_equipment_manufacturer metal_fabricator metal_supplier machine_shop chemical_plant
engineering_service structural_engineer hvac_service plastics_company telecommunications_company energy_company
electric_utility_provider water_utility_provider public_utility accountant appraisal_service notary_public
attorney_or_law_firm legal_service insurance_agency financial_service financial_advising investing
auto_dealer used_auto_dealer auto_company auto_manufacturer automotive_repair automotive_service auto_parts_store
auto_detailing auto_body_shop auto_restoration_service auto_customization auto_leasing tire_dealer_and_repair
truck_repair truck_dealer motorcycle_dealer motorcycle_repair towing_service car_wash
political_party_office political_organization labor_union non_governmental_association
jail_or_prison military_site police_station fire_station fire_protection_service courthouse funeral_service
muslim_place_of_worship christian_place_of_worship religious_organization religious_school wedding_chapel
hospital doctors_office dental_clinic outpatient_care_facility emergency_department health_care physical_therapy
orthodontics podiatry optometry psychology psychotherapy counseling abuse_and_addiction_treatment_center
naturopathic_medicine medical_service_organization medical_research_institute medical_school medical_supply_store
laboratory_testing retirement_home pharmacy diagnostics_imaging_or_lab_service
elementary_school middle_school high_school preschool day_care_preschool school public_school private_school
adult_entertainment_venue gun_and_ammo_store animal_shelter garbage_collection_service recycling_center
warehouse warehouse_club_store carpet_cleaning home_cleaning damage_restoration pest_control_service
mover shipping_center ev_charging_station occupational_safety it_service_and_computer_repair software_development
information_technology_company web_designer automation_service elevator_service windows_installation roofing
plumbing electrician key_and_locksmith land_surveying architectural_designer interior_design product_design
media_agency media_news_company print_media publisher broadcasting_media_production music_production
translating_and_interpreting_service tutoring_service educational_service vocational_and_technical_school
agricultural_service agricultural_cooperative agriculture livestock_breeder farm pet_breeder
energy_company internet_service_provider home_security home_service corporate_or_business_office
textile_manufacturer glass_manufacturer glass_and_mirror_sales_service plastic_manufacturer
food_beverage_distributor electronic_equipment_supplier computer_hardware_company rental_service
environmental_or_ecological_service wedding_planning party_and_event_planning event_photography_service
geographic_entities mountain bridge forest rv_park cabin social_or_community_service
'''.split())
EXCLUDE_SUBSTR = ('b2b_', '_manufacturer', 'manufacturer')

# --- Türkçe adlar ve sıralama (1 = sosyal mekânlar, 2 = diğer günlük yerler, 3 = geri kalanı) -------
LABEL = {
    'cafe': 'Kafe', 'coffee_shop': 'Kafe', 'tea_room': 'Çay evi', 'internet_cafe': 'İnternet kafe',
    'restaurant': 'Restoran', 'turkish_restaurant': 'Restoran', 'fast_food_restaurant': 'Fast food',
    'steakhouse': 'Et lokantası', 'doner_kebab_restaurant': 'Dönerci', 'seafood_restaurant': 'Balık restoranı',
    'pizza_restaurant': 'Pizza', 'burger_restaurant': 'Burger', 'barbecue_restaurant': 'Mangal',
    'breakfast_and_brunch_restaurant': 'Kahvaltı', 'buffet_restaurant': 'Açık büfe', 'soup_restaurant': 'Çorbacı',
    'chicken_restaurant': 'Tavuk', 'diner': 'Lokanta', 'comfort_food_restaurant': 'Lokanta',
    'bakery': 'Fırın', 'dessert_shop': 'Tatlıcı', 'ice_cream_shop': 'Dondurma', 'candy_store': 'Şekerci',
    'chocolatier': 'Çikolata', 'bagel_shop': 'Simit', 'smoothie_juice_bar': 'Meyve suyu', 'food_truck_stand': 'Sokak lezzeti',
    'bar': 'Bar', 'pub': 'Pub', 'dance_club': 'Gece kulübü', 'lounge': 'Lounge', 'hookah_bar': 'Nargile',
    'beer_garden': 'Bira bahçesi', 'brewery': 'Bira', 'music_venue': 'Müzik mekânı', 'comedy_club': 'Komedi kulübü',
    'movie_theater': 'Sinema', 'theatre_venue': 'Tiyatro', 'arts_and_entertainment': 'Eğlence', 'arcade': 'Oyun salonu',
    'bowling_alley': 'Bowling', 'pool_billiards': 'Bilardo', 'amusement_park': 'Lunapark', 'water_park': 'Su parkı',
    'paintball': 'Paintball', 'park': 'Park', 'playground': 'Oyun parkı', 'beach': 'Plaj', 'public_plaza': 'Meydan',
    'lake': 'Göl', 'national_park': 'Milli park', 'nature_reserve': 'Doğa alanı', 'hiking_trail': 'Yürüyüş yolu',
    'botanical_garden': 'Botanik bahçe', 'campground': 'Kamp alanı', 'pier': 'İskele', 'marina': 'Marina',
    'shopping_mall': 'AVM', 'shopping': 'Alışveriş', 'department_store': 'Mağaza', 'superstore': 'Market',
    'stadium_arena': 'Stadyum', 'soccer_stadium': 'Stadyum', 'soccer_field': 'Halı saha', 'basketball_court': 'Basketbol sahası',
    'tennis_court': 'Tenis kortu', 'gym': 'Spor salonu', 'sport_or_fitness_facility': 'Spor tesisi', 'pilates_studio': 'Pilates',
    'martial_arts_club': 'Dövüş sporu', 'swimming_pool': 'Yüzme havuzu', 'dance_studio': 'Dans stüdyosu',
    'sports_and_recreation': 'Spor', 'sport_league': 'Spor', 'amateur_sport_team': 'Spor takımı', 'race_track': 'Pist',
    'museum': 'Müze', 'art_gallery': 'Sanat galerisi', 'library': 'Kütüphane', 'bookstore': 'Kitapçı',
    'cultural_center': 'Kültür merkezi', 'community_center': 'Toplum merkezi', 'auditorium': 'Salon',
    'historic_site': 'Tarihi yer', 'monument': 'Anıt', 'castle': 'Kale', 'aquarium': 'Akvaryum',
    'hotel': 'Otel', 'lodging': 'Konaklama', 'resort': 'Tatil köyü', 'spa': 'Spa', 'massage_therapy': 'Masaj',
    'coworking_space': 'Ortak çalışma alanı', 'college_university': 'Üniversite', 'campus_building': 'Kampüs',
    'language_school': 'Dil okulu', 'music_school': 'Müzik okulu', 'art_school': 'Sanat okulu', 'education': 'Eğitim',
    'specialty_school': 'Kurs', 'driving_school': 'Sürücü kursu',
    'grocery_store': 'Market', 'convenience_store': 'Bakkal', 'delicatessen': 'Şarküteri', 'butcher_shop': 'Kasap',
    'organic_grocery_store': 'Organik market', 'produce_store': 'Manav', 'farmers_market': 'Pazar', 'flea_market': 'Bit pazarı',
    'night_market': 'Gece pazarı', 'health_food_store': 'Sağlıklı gıda', 'cheese_shop': 'Peynirci',
    'clothing_store': 'Giyim', 'womens_clothing_store': 'Kadın giyim', 'mens_clothing_store': 'Erkek giyim',
    'childrens_clothing_store': 'Çocuk giyim', 'shoe_store': 'Ayakkabı', 'fashion_boutique': 'Butik',
    'fashion_accessories_store': 'Aksesuar', 'jewelry_store': 'Kuyumcu', 'bridal_shop': 'Gelinlik',
    'electronics_store': 'Elektronik', 'mobile_phone_store': 'Telefon', 'computer_store': 'Bilgisayar',
    'flowers_and_gifts_store': 'Çiçek ve hediye', 'toy_store': 'Oyuncak', 'pet_store': 'Evcil hayvan', 'veterinarian': 'Veteriner',
    'hair_salon': 'Kuaför', 'barber': 'Berber', 'beauty_salon': 'Güzellik salonu', 'nail_salon': 'Tırnak', 'tattoo_and_piercing': 'Dövme',
    'beauty_supply_store': 'Kozmetik', 'cosmetics_and_fragrance_store': 'Kozmetik', 'nutrition_service': 'Beslenme',
    'gas_station': 'Benzinlik', 'bank': 'Banka', 'bank_or_credit_union': 'Banka', 'post_office': 'PTT',
    'government_office': 'Kamu', 'town_hall': 'Belediye', 'community_and_government': 'Kamu',
    'train_station': 'Tren istasyonu', 'bus_station': 'Otogar', 'ferry_boat_company': 'Feribot', 'parking': 'Otopark',
    'travel_service': 'Seyahat', 'tour_operator': 'Tur', 'travel_and_transportation': 'Ulaşım', 'taxi_service': 'Taksi',
    'car_rental_service': 'Araç kiralama', 'hardware_store': 'Nalbur', 'home_goods_store': 'Ev eşyası',
    'furniture_store': 'Mobilya', 'home_improvement_store': 'Yapı market', 'building_supply_store': 'Yapı malzemesi',
    'linen_store': 'Ev tekstili', 'carpet_store': 'Halı', 'mattress_store': 'Yatak', 'lighting_store': 'Aydınlatma',
    'appliance_store': 'Beyaz eşya', 'sporting_goods_store': 'Spor mağazası', 'sportswear_store': 'Spor giyim',
    'bike_store': 'Bisiklet', 'outdoor_store': 'Outdoor', 'arts_crafts_and_hobby_store': 'Hobi', 'hobby_shop': 'Hobi',
    'antique_store': 'Antika', 'second_hand_store': 'İkinci el', 'music_and_dvd_store': 'Müzik', 'comic_books_store': 'Çizgi roman',
    'camera_and_photography_store': 'Fotoğraf', 'office_supply_store': 'Kırtasiye', 'tobacco_shop': 'Tütün',
    'liquor_store': 'Şarap ve içki', 'vitamin_and_supplement_store': 'Takviye', 'discount_store': 'İndirim mağazası',
    'dry_cleaning': 'Kuru temizleme', 'sewing_and_alterations': 'Terzi', 'eyewear_store': 'Gözlükçü',
    'nursery_and_gardening_store': 'Çiçekçi / fidan', 'luggage_store': 'Bavul', 'party_supply_store': 'Parti malzemesi',
    'food_and_drink': 'Yeme içme', 'caterer': 'Catering', 'fabric_store': 'Kumaş', 'fashion_and_apparel_store': 'Giyim',
    'hardware_home_and_garden_store': 'Nalbur', 'arts_and_entertainment_venue': 'Eğlence',
    'mediterranean_restaurant': 'Restoran', 'middle_eastern_restaurant': 'Restoran', 'european_restaurant': 'Restoran',
    'american_restaurant': 'Restoran', 'italian_restaurant': 'Restoran', 'asian_restaurant': 'Restoran',
    'fish_and_chips_restaurant': 'Restoran', 'theme_restaurant': 'Restoran', 'ski_resort': 'Kayak merkezi',
    'surfing': 'Sörf', 'fishing_club': 'Balıkçı kulübü', 'youth_organization': 'Gençlik', 'sporting_goods_manufacturer': 'Spor',
}
RANK1 = set('''cafe coffee_shop tea_room internet_cafe restaurant turkish_restaurant fast_food_restaurant steakhouse
doner_kebab_restaurant seafood_restaurant pizza_restaurant burger_restaurant barbecue_restaurant
breakfast_and_brunch_restaurant buffet_restaurant soup_restaurant chicken_restaurant diner comfort_food_restaurant
bakery dessert_shop ice_cream_shop chocolatier bagel_shop smoothie_juice_bar food_truck_stand bar pub dance_club
lounge hookah_bar beer_garden brewery music_venue comedy_club movie_theater theatre_venue arts_and_entertainment
arcade bowling_alley pool_billiards amusement_park water_park paintball park beach public_plaza lake national_park
nature_reserve hiking_trail botanical_garden campground pier marina shopping_mall stadium_arena soccer_stadium
soccer_field basketball_court tennis_court gym sport_or_fitness_facility pilates_studio martial_arts_club swimming_pool
dance_studio museum art_gallery library bookstore cultural_center community_center auditorium historic_site monument
castle aquarium hotel lodging resort spa coworking_space college_university campus_building mediterranean_restaurant
middle_eastern_restaurant european_restaurant american_restaurant italian_restaurant asian_restaurant
fish_and_chips_restaurant theme_restaurant ski_resort farmers_market'''.split())
RANK2 = set('''grocery_store convenience_store delicatessen butcher_shop organic_grocery_store produce_store clothing_store
womens_clothing_store mens_clothing_store shoe_store fashion_boutique electronics_store mobile_phone_store
department_store superstore shopping hair_salon barber beauty_salon nail_salon flowers_and_gifts_store toy_store
pet_store sporting_goods_store sportswear_store bike_store arts_crafts_and_hobby_store hobby_shop night_market
flea_market health_food_store candy_store cheese_shop massage_therapy tattoo_and_piercing'''.split())


# Adında geçince yer listeye alınmaz (kategori yanlış girilmiş olsa da hassas yerler elensin)
NAME_STEMS = ('hastane', 'klinik', 'poliklinik', 'eczane', 'mescit', 'kilise', 'sinagog', 'anaokul', 'ilkokul',
              'ortaokul', 'sendika', 'dernegi', 'dernek', 'vakfi', 'emniyet', 'karakol', 'jandarma', 'cezaevi',
              'savcilik', 'adliye', 'psikolog', 'terapi', 'diyaliz', 'kuran', 'tarikat', 'dergah', 'okulu', 'ilkogretim', 'muftu', 'diyanet', 'imam')
NAME_EXACT = {'cami', 'camii', 'camisi', 'lise', 'lisesi', 'parti', 'partisi', 'kres', 'hekim', 'tip', 'siyasi', 'ocagi', 'chp', 'mhp', 'akp', 'hdp', 'dem', 'iyi'}


def sensitive_name(folded: str) -> bool:
    toks = re.findall(r'[a-z0-9]+', folded)
    for t in toks:
        if t in NAME_EXACT or any(t.startswith(x) for x in NAME_STEMS):
            return True
    return False


def keep(cat: str) -> bool:
    if cat in EXCLUDE_EXACT:
        return False
    return not any(s in cat for s in EXCLUDE_SUBSTR)


def label_of(cat: str) -> str:
    if cat in LABEL:
        return LABEL[cat]
    if cat.endswith('_restaurant'):
        return 'Restoran'
    if cat.endswith('_store') or cat.endswith('_shop'):
        return 'Mağaza'
    return 'Mekân'


def rank_of(cat: str) -> int:
    if cat in RANK1 or cat.endswith('_restaurant'):
        return 1
    if cat in RANK2:
        return 2
    return 3


def main():
    con = duckdb.connect()
    cty = con.execute(f"select name, wkt from '{DIV}' where subtype='county' and region='TR-41' and is_land").fetchall()
    names = [c[0] for c in cty]
    polys = [wkt.loads(c[1]) for c in cty]
    df = con.execute(
        f"select id,confidence,name,cat,addr,lon,lat from '{SRC}' "
        "where name is not null and length(trim(name))>1 and confidence>=0.5"
    ).df()
    pts = shapely.points(df.lon.values, df.lat.values)
    idx = STRtree(polys).query(pts, predicate='within')
    dist = np.full(len(df), -1)
    dist[idx[0]] = idx[1]
    df['district'] = [names[i] if i >= 0 else None for i in dist]
    df = df[df.district.notna()].copy()
    df = df[df.cat.notna()].copy()  # kategorisi bilinmeyen yer hassas mı bilinemez: alınmaz
    df = df[[keep(c) for c in df.cat]].copy()
    df = df.sort_values('confidence', ascending=False)
    rows, seen = [], {}
    for r in df.itertuples():
        name = tidy(r.name)[:80]
        f = fold(name)
        if len(f) < 2 or sensitive_name(f):
            continue
        q, rr = cell_of(r.lon, r.lat, SIZE)
        key = (f, round(r.lat * 800), round(r.lon * 800))  # ~140 m'lik kutu: aynı ad aynı yerde bir kez
        if key in seen:
            continue
        seen[key] = 1
        cat = r.cat
        addr = tidy(r.addr)[:90] if isinstance(r.addr, str) else ''
        rows.append([r.id, name, f, cat, label_of(cat), r.district, addr, f'{r.lat:.6f}', f'{r.lon:.6f}', q, rr,
                     rank_of(cat), f'{r.confidence:.2f}'])
    rows.sort(key=lambda x: (x[5], x[1]))
    with open(OUT, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['id', 'name', 'search_text', 'cat', 'cat_label', 'district', 'address', 'lat', 'lon', 'q', 'r', 'rank', 'confidence'])
        w.writerows(rows)
    print(len(rows), 'yer yazıldı ->', OUT)


if __name__ == '__main__':
    main()
