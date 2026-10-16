"""Yer listesi kuralları: hangi yerler alınır, Türkçe kategori adı ve sıralama.

Hassas yerler (ibadethane, sağlık, okul / kreş, siyasi / sendika / dernek, emniyet / askeri / cezaevi...) ve işletmeler
arası (B2B) kayıtlar listeye ALINMAZ: üye bu yerleri akışta etiketleyip kendisi hakkında hassas bilgi vermesin.
Kategoriler Overture 'taxonomy' ağacındandır: primary (ör. cafe) ve hierarchy (ör. food_and_drink > ...).
"""
import re

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


# Ağacın tamamen dışarıda kalan dalları (1. ve 2. seviye)
EXCLUDE_TOP = {'health_care'}
EXCLUDE_L2 = {
    ('services_and_business', x) for x in (
        'real_estate_service', 'b2b_service', 'financial_service', 'professional_service', 'home_service',
        'building_or_construction_service', 'corporate_or_business_office', 'technical_service', 'printing_service',
        'agricultural_service', 'legal_service', 'media_service', 'storage_facility', 'design_service', 'rental_service',
        'housing_or_property_service', 'shipping_or_delivery_service', 'environmental_or_ecological_service',
        'industrial_facility_or_service', 'telecommunications_service', 'security_service', 'family_service',
        'event_or_party_service')
} | {
    ('travel_and_transportation', 'vehicle_service'), ('shopping', 'vehicle_dealer'),
    ('cultural_and_historic', 'place_of_worship'), ('cultural_and_historic', 'religious_organization'),
    ('community_and_government', 'military_site'), ('community_and_government', 'public_safety_service'),
    ('community_and_government', 'civic_organization'), ('community_and_government', 'social_or_community_service'),
    ('community_and_government', 'public_utility'), ('education', 'research_institute'),
    ('arts_and_entertainment', 'spiritual_advising'), ('lifestyle_services', 'food_service'),
}
# Dışarıda kalan dalda olsa da alınanlar (günlük hayatta buluşulan / bilinen yerler)
KEEP_EXACT = set('''bank bank_or_credit_union dry_cleaning laundromat laundry_service photography_studio event_venue
wedding_venue banquet_hall car_rental_service bike_rental'''.split())
# Okullar (çocuklar) ve benzerleri: eğitim dalının bu kategorileri alınmaz
EXCLUDE_EDU = set('''elementary_school middle_school high_school preschool day_care_preschool school public_school
private_school religious_school kindergarten childrens_daycare montessori_school'''.split())
# Doğal yerlerden yalnızca bunlar (dağ, orman gibi geniş ve adı belirsiz kayıtlar alınmaz)
GEO_KEEP = set('''beach lake island waterfall cave bay scenic_lookout canyon hot_springs river_beach'''.split())


def keep_place(cat: str, hier: list) -> bool:
    if cat in KEEP_EXACT:
        return True
    if cat in EXCLUDE_EXACT or any(x in cat for x in EXCLUDE_SUBSTR):
        return False
    top = hier[0] if hier else None
    l2 = hier[1] if len(hier) > 1 else None
    if top is None:
        return False  # kategorisi bilinmeyen yer hassas mı bilinemez: alınmaz
    if top in EXCLUDE_TOP or (top, l2) in EXCLUDE_L2:
        return False
    if top == 'education' and (cat in EXCLUDE_EDU or 'school' in cat and cat not in LABEL):
        return False
    if top == 'geographic_entities':
        return cat in GEO_KEEP
    return True


def keep(cat: str) -> bool:
    if cat in EXCLUDE_EXACT:
        return False
    return not any(s in cat for s in EXCLUDE_SUBSTR)


# 2. seviyeye göre yedek Türkçe ad
L2_LABEL = {
    'restaurant': 'Restoran', 'casual_eatery': 'Lokanta', 'non_alcoholic_beverage_venue': 'Kafe',
    'alcoholic_beverage_venue': 'Bar', 'fashion_and_apparel_store': 'Giyim', 'food_and_beverage_store': 'Gıda',
    'specialty_store': 'Mağaza', 'personal_or_beauty_service': 'Kişisel bakım', 'wellness_service': 'Spa ve bakım',
    'animal_or_pet_service': 'Evcil hayvan', 'hotel': 'Otel', 'sport_or_fitness_facility': 'Spor tesisi',
    'park': 'Park', 'historic_site': 'Tarihi yer', 'memorial_site': 'Anıt', 'cultural_center': 'Kültür merkezi',
    'performing_arts_venue': 'Sahne', 'nightlife_venue': 'Gece hayatı', 'gaming_venue': 'Oyun salonu',
    'stadium_arena': 'Stadyum', 'museum': 'Müze', 'movie_theater': 'Sinema', 'event_venue': 'Etkinlik alanı',
    'amusement_attraction': 'Eğlence', 'arts_and_crafts_space': 'Sanat atölyesi', 'shopping_mall': 'AVM',
    'market': 'Pazar', 'department_store': 'Mağaza', 'superstore': 'Market', 'convenience_store': 'Bakkal',
    'second_hand_store': 'İkinci el', 'discount_store': 'İndirim mağazası', 'warehouse_club_store': 'Toptan market',
    'travel_service': 'Seyahat', 'fueling_station': 'Benzinlik', 'parking': 'Otopark', 'campground': 'Kamp alanı',
    'ground_transport_facility_or_service': 'Ulaşım', 'air_transport_facility_or_service': 'Havalimanı',
    'water_transport_facility_or_service': 'İskele', 'educational_facility': 'Eğitim', 'educational_service': 'Kurs',
    'place_of_learning': 'Eğitim', 'library': 'Kütüphane', 'government_office': 'Kamu', 'public_facility': 'Kamu',
    'sport_or_recreation_club': 'Spor kulübü', 'recreational_trail_or_path': 'Yürüyüş yolu', 'sport_team': 'Spor',
    'sport_league': 'Spor', 'recreational_equipment_rental': 'Kiralama', 'land_feature': 'Doğa',
    'water_feature': 'Doğa', 'built_feature': 'Yer', 'private_lodging': 'Konaklama', 'bed_and_breakfast': 'Pansiyon',
    'resort': 'Tatil köyü', 'hostel': 'Hostel', 'animal_attraction': 'Hayvanat bahçesi', 'festival_venue': 'Festival alanı',
    'social_club': 'Kulüp', 'science_attraction': 'Bilim merkezi', 'laundry_service': 'Kuru temizleme',
}


def label_of(cat: str, l2: str = '') -> str:
    if cat in LABEL:
        return LABEL[cat]
    if cat.endswith('_restaurant'):
        return 'Restoran'
    if cat.endswith('_store') or cat.endswith('_shop'):
        return 'Mağaza'
    return L2_LABEL.get(l2, 'Mekân')


RANK1_L2 = {'restaurant', 'casual_eatery', 'non_alcoholic_beverage_venue', 'alcoholic_beverage_venue', 'park',
            'nightlife_venue', 'performing_arts_venue', 'gaming_venue', 'museum', 'movie_theater', 'stadium_arena',
            'shopping_mall', 'historic_site', 'cultural_center', 'event_venue', 'amusement_attraction', 'hotel'}


def rank_of(cat: str, l2: str = '') -> int:
    if cat in RANK1 or cat.endswith('_restaurant') or l2 in RANK1_L2:
        return 1
    if cat in RANK2:
        return 2
    return 3


